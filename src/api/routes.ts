import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { UserGoogleAuth } from "../auth/user-google-auth.js";
import type { GscServiceAuth } from "../auth/gsc-service-auth.js";
import {
  createSessionToken,
  getSessionCookieName,
  parseSessionToken,
  sessionCookieOptions,
  type UserSession,
} from "../auth/session.js";
import { GscClient } from "../gsc/client.js";
import {
  isWskzBrandQuery,
} from "../brand/wskz-brand-filter.js";
import { WSKZ_BRAND_DIMENSION_FILTER_GROUPS } from "../brand/wskz-brand-dimension-filter.js";
import {
  categorizeWskzQuery,
  WSKZ_QUERY_CATEGORIES,
} from "../brand/wskz-query-category.js";
import {
  addToMetricBucket,
  createMetricBucket,
  metricBucketToRow,
} from "../brand/wskz-metrics.js";
import {
  brandAggregateToOverview,
  brandPerSiteToDomainBreakdown,
  buildBrandTrendRows,
  fetchBrandDatedQueryRowsPerSite,
  fetchBrandQueryRowsPerSite,
  mergeBrandQueryRows,
  monthKeyFromDate,
} from "../brand/wskz-brand-data.js";

const brandDateRangeSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

type TrendGranularity = "day" | "month";

function parseGranularity(query: unknown): TrendGranularity {
  const params =
    typeof query === "object" && query !== null
      ? (query as Record<string, unknown>)
      : {};
  return params.granularity === "day" ? "day" : "month";
}

interface RouteDeps {
  config: AppConfig;
  userAuth: UserGoogleAuth;
  gscAuth: GscServiceAuth;
}

function getUserSession(req: FastifyRequest, secret: string): UserSession | null {
  const cookieName = getSessionCookieName();
  const token = req.cookies[cookieName];
  return parseSessionToken(token, secret);
}

function requireUser(config: AppConfig) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const session = getUserSession(req, config.sessionSecret);
    if (!session) {
      return reply.status(401).send({ error: "Wymagane logowanie" });
    }
    req.userSession = session;
  };
}

function getGscClient(gscAuth: GscServiceAuth): GscClient | null {
  if (!gscAuth.isConfigured()) return null;
  const auth = gscAuth.getAuthenticatedClient();
  if (!auth) return null;
  return new GscClient(auth);
}

function defaultDateRange() {
  const end = new Date();
  end.setHours(12, 0, 0, 0);
  end.setDate(end.getDate() - 3);
  const start = new Date(end);
  start.setMonth(start.getMonth() - 16);
  start.setDate(start.getDate() + 1);

  const formatLocalDate = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  return {
    startDate: formatLocalDate(start),
    endDate: formatLocalDate(end),
  };
}

function parseBrandDateRangeQuery(query: unknown) {
  const params =
    typeof query === "object" && query !== null
      ? (query as Record<string, unknown>)
      : {};

  return brandDateRangeSchema.safeParse({
    ...defaultDateRange(),
    ...params,
  });
}

function parseSelectedBrandDomains(
  domainsParam: string | undefined,
  configuredDomains: string[],
): string[] {
  if (!domainsParam?.trim()) {
    return [...configuredDomains];
  }

  const requested = new Set(
    domainsParam
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
  );

  return configuredDomains.filter((d) => requested.has(d.toLowerCase()));
}

function parseBrandQuery(query: unknown, configuredDomains: string[]) {
  const parsed = parseBrandDateRangeQuery(query);
  if (!parsed.success) {
    return parsed;
  }

  const params =
    typeof query === "object" && query !== null
      ? (query as Record<string, unknown>)
      : {};
  const domainsParam = typeof params.domains === "string" ? params.domains : undefined;
  const selectedDomains = parseSelectedBrandDomains(domainsParam, configuredDomains);

  if (!selectedDomains.length) {
    return {
      success: false as const,
      error: {
        flatten: () => ({
          fieldErrors: { domains: ["Wybierz co najmniej jedną domenę"] },
        }),
      },
    };
  }

  return {
    success: true as const,
    data: {
      ...parsed.data,
      selectedDomains,
    },
  };
}

function filterBrandSitesByDomains(
  brandSites: Awaited<ReturnType<typeof resolveBrandSites>>,
  selectedDomains: string[],
) {
  const selected = new Set(selectedDomains.map((d) => d.toLowerCase()));
  const matched = brandSites.matched.filter((m) => selected.has(m.domain.toLowerCase()));

  return {
    matched,
    missing: brandSites.missing,
    siteUrls: matched.map((m) => m.siteUrl),
  };
}

function siteUrlToDomain(siteUrl: string): string {
  if (siteUrl.startsWith("sc-domain:")) {
    return siteUrl.slice("sc-domain:".length);
  }

  try {
    return new URL(siteUrl).hostname.replace(/^www\./, "");
  } catch {
    return siteUrl;
  }
}

async function resolveBrandSites(client: GscClient, wskzDomains: string[]) {
  const sites = await client.listSites();
  const configured = wskzDomains.map((d) => d.toLowerCase());

  const matched: Array<{ domain: string; siteUrl: string }> = [];
  const missing: string[] = [];

  for (const domain of configured) {
    const site = sites.find((s) => s.siteUrl.toLowerCase().includes(domain));
    if (site) {
      matched.push({ domain, siteUrl: site.siteUrl });
    } else {
      missing.push(domain);
    }
  }

  return { matched, missing, siteUrls: matched.map((m) => m.siteUrl) };
}

function aggregateOverview(rows: Array<{ clicks: number; impressions: number; position: number }>) {
  const clicks = rows.reduce((sum, r) => sum + r.clicks, 0);
  const impressions = rows.reduce((sum, r) => sum + r.impressions, 0);
  const positionWeightedSum = rows.reduce((sum, r) => sum + r.position * r.impressions, 0);
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: impressions > 0 ? positionWeightedSum / impressions : 0,
  };
}

function aggregateTrendRows(
  allRows: Array<Array<{ keys: string[]; clicks: number; impressions: number; position: number }>>,
) {
  const map = new Map<string, { clicks: number; impressions: number; positionWeightedSum: number }>();

  for (const rows of allRows) {
    for (const row of rows) {
      const date = row.keys[0] ?? "";
      if (!date) continue;
      const prev = map.get(date) ?? { clicks: 0, impressions: 0, positionWeightedSum: 0 };
      prev.clicks += row.clicks;
      prev.impressions += row.impressions;
      prev.positionWeightedSum += row.position * row.impressions;
      map.set(date, prev);
    }
  }

  const rows = [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => {
      const ctr = v.impressions > 0 ? v.clicks / v.impressions : 0;
      const position = v.impressions > 0 ? v.positionWeightedSum / v.impressions : 0;
      return { keys: [date], clicks: v.clicks, impressions: v.impressions, ctr, position };
    });

  return rows;
}

export async function registerRoutes(
  app: FastifyInstance,
  deps: RouteDeps,
): Promise<void> {
  const { config, userAuth, gscAuth } = deps;
  const authGuard = requireUser(config);

  app.get("/api/auth/status", async (req) => {
    const session = getUserSession(req, config.sessionSecret);
    return {
      authenticated: Boolean(session),
      email: session?.email ?? null,
      name: session?.name ?? null,
      gscConfigured: gscAuth.isConfigured(),
    };
  });

  app.get("/auth/google", async (_req, reply) => {
    const url = userAuth.getAuthUrl();
    return reply.redirect(url);
  });

  app.get("/auth/callback", async (req, reply) => {
    const code = (req.query as { code?: string }).code;
    if (!code) {
      return reply.redirect("/?error=missing_code");
    }

    try {
      const profile = await userAuth.handleCallback(code);

      if (!userAuth.isEmailAllowed(profile.email)) {
        return reply.redirect("/?error=not_allowed");
      }

      const token = createSessionToken(profile, config.sessionSecret);
      reply.setCookie(getSessionCookieName(), token, sessionCookieOptions());
      return reply.redirect("/?connected=1");
    } catch (error) {
      app.log.error(error);
      return reply.redirect("/?error=auth_failed");
    }
  });

  app.post("/auth/logout", async (_req, reply) => {
    reply.clearCookie(getSessionCookieName(), { path: "/" });
    return { ok: true };
  });

  // Brand report: agregacja dla WSKZ po wielu domenach
  app.get("/api/brand/wskz/overview", { preHandler: authGuard }, async (req, reply) => {
    const client = getGscClient(gscAuth);
    if (!client) {
      return reply.status(503).send({
        error: "Brak skonfigurowanego dostępu do Google Search Console po stronie serwera",
      });
    }

    const parsed = parseBrandQuery(req.query, deps.config.wskzDomains);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Nieprawidłowe parametry", details: parsed.error.flatten() });
    }

    const { startDate, endDate, selectedDomains } = parsed.data;
    const granularity = parseGranularity(req.query);

    try {
      const allBrandSites = await resolveBrandSites(client, deps.config.wskzDomains);
      const brandSites = filterBrandSitesByDomains(allBrandSites, selectedDomains);
      if (!brandSites.siteUrls.length) {
        return reply.status(404).send({
          error: "Nie skonfigurowano dostępu GSC do wybranych domen WSKZ",
          configuredDomains: deps.config.wskzDomains,
          selectedDomains,
          missingDomains: brandSites.missing,
        });
      }

      const matched = brandSites.matched;
      const queryResults = await fetchBrandQueryRowsPerSite(
        client,
        matched,
        startDate,
        endDate,
      );
      const brandQueries = mergeBrandQueryRows(matched, queryResults);
      const datedResults = await fetchBrandDatedQueryRowsPerSite(
        client,
        matched,
        startDate,
        endDate,
      );

      return {
        overview: brandAggregateToOverview(brandQueries),
        domainBreakdown: brandPerSiteToDomainBreakdown(matched, queryResults),
        trend: {
          rows: buildBrandTrendRows(datedResults, granularity),
          granularity,
        },
        range: { startDate, endDate },
        availableDomains: deps.config.wskzDomains,
        selectedDomains,
        domainColumns: deps.config.wskzDomains,
        domains: brandSites.matched.map((m) => m.domain),
        matchedSites: brandSites.matched,
        missingDomains: brandSites.missing,
      };
    } catch (error) {
      app.log.error(error);
      return reply.status(502).send({ error: "Nie udało się pobrać raportu WSKZ" });
    }
  });

  app.get("/api/brand/wskz/queries", { preHandler: authGuard }, async (req, reply) => {
    const client = getGscClient(gscAuth);
    if (!client) {
      return reply.status(503).send({
        error: "Brak skonfigurowanego dostępu do Google Search Console po stronie serwera",
      });
    }

    const parsed = parseBrandQuery(req.query, deps.config.wskzDomains);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Nieprawidłowe parametry" });
    }

    const { startDate, endDate, selectedDomains } = parsed.data;

    try {
      const allBrandSites = await resolveBrandSites(client, deps.config.wskzDomains);
      const brandSites = filterBrandSitesByDomains(allBrandSites, selectedDomains);
      if (!brandSites.siteUrls.length) {
        return reply.status(404).send({
          error: "Nie skonfigurowano dostępu GSC do wybranych domen WSKZ",
          configuredDomains: deps.config.wskzDomains,
          selectedDomains,
          missingDomains: brandSites.missing,
        });
      }

      // Pre-filtr regex + paginacja: pobieramy wszystkie pasujące wiersze (bez limitu aplikacji).
      const matched = brandSites.matched;

      const perSiteResults = await fetchBrandQueryRowsPerSite(
        client,
        matched,
        startDate,
        endDate,
      );

      const aggregated = mergeBrandQueryRows(matched, perSiteResults);

      const wskzDomainList = deps.config.wskzDomains;

      const rows = [...aggregated.entries()]
        .map(([query, v]) => {
          const ctr = v.impressions > 0 ? v.clicks / v.impressions : 0;
          const position = v.impressions > 0 ? v.positionWeightedSum / v.impressions : 0;
          return {
            keys: [query],
            clicks: v.clicks,
            impressions: v.impressions,
            ctr,
            position,
            domainPresence: Object.fromEntries(
              wskzDomainList.map((d) => [d, v.domains.has(d.toLowerCase())]),
            ),
          };
        })
        .sort((a, b) => b.clicks - a.clicks);

      return {
        rows,
        totalRows: rows.length,
        range: { startDate, endDate },
        availableDomains: deps.config.wskzDomains,
        selectedDomains,
        domainColumns: wskzDomainList,
        domains: brandSites.matched.map((m) => m.domain),
        matchedSites: brandSites.matched,
        missingDomains: brandSites.missing,
      };
    } catch (error) {
      app.log.error(error);
      return reply.status(502).send({ error: "Nie udało się pobrać zapytań WSKZ" });
    }
  });

  app.get("/api/brand/wskz/categories", { preHandler: authGuard }, async (req, reply) => {
    const client = getGscClient(gscAuth);
    if (!client) {
      return reply.status(503).send({
        error: "Brak skonfigurowanego dostępu do Google Search Console po stronie serwera",
      });
    }

    const parsed = parseBrandQuery(req.query, deps.config.wskzDomains);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Nieprawidłowe parametry" });
    }

    const { startDate, endDate, selectedDomains } = parsed.data;
    const granularity = parseGranularity(req.query);

    try {
      const allBrandSites = await resolveBrandSites(client, deps.config.wskzDomains);
      const brandSites = filterBrandSitesByDomains(allBrandSites, selectedDomains);
      if (!brandSites.siteUrls.length) {
        return reply.status(404).send({
          error: "Nie skonfigurowano dostępu GSC do wybranych domen WSKZ",
          configuredDomains: deps.config.wskzDomains,
          selectedDomains,
          missingDomains: brandSites.missing,
        });
      }

      const matched = brandSites.matched;

      const [queryResults, datedResults] = await Promise.all([
        fetchBrandQueryRowsPerSite(client, matched, startDate, endDate),
        fetchBrandDatedQueryRowsPerSite(client, matched, startDate, endDate),
      ]);

      const brandQueries = mergeBrandQueryRows(matched, queryResults);

      const categoryBuckets = new Map(
        WSKZ_QUERY_CATEGORIES.map((category) => [category, createMetricBucket()]),
      );

      for (const [query, bucket] of brandQueries.entries()) {
        const category = categorizeWskzQuery(query);
        const target = categoryBuckets.get(category)!;
        target.clicks += bucket.clicks;
        target.impressions += bucket.impressions;
        target.positionWeightedSum += bucket.positionWeightedSum;
      }

      const categories = WSKZ_QUERY_CATEGORIES.map((category) => {
        const bucket = categoryBuckets.get(category)!;
        const metrics = metricBucketToRow([category], bucket);
        return {
          category,
          clicks: metrics.clicks,
          impressions: metrics.impressions,
          ctr: metrics.ctr,
          position: metrics.position,
        };
      }).sort((a, b) => b.impressions - a.impressions);

      const queries = [...brandQueries.entries()]
        .map(([query, bucket]) => {
          const metrics = metricBucketToRow([query], bucket);
          return {
            keys: [query],
            category: categorizeWskzQuery(query),
            clicks: metrics.clicks,
            impressions: metrics.impressions,
            ctr: metrics.ctr,
            position: metrics.position,
          };
        })
        .sort((a, b) => b.impressions - a.impressions);

      const trendMap = new Map<string, ReturnType<typeof createMetricBucket>>();

      for (const result of datedResults) {
        for (const row of result.rows) {
          const date = row.keys[0] ?? "";
          const query = row.keys[1] ?? "";
          if (!date || !query || !isWskzBrandQuery(query)) continue;

          const category = categorizeWskzQuery(query);
          const period =
            granularity === "month" ? monthKeyFromDate(date) : date.replaceAll("-", "");
          const trendKey = `${period}|${category}`;
          const bucket = trendMap.get(trendKey) ?? createMetricBucket();
          addToMetricBucket(bucket, row);
          trendMap.set(trendKey, bucket);
        }
      }

      const periods = [
        ...new Set([...trendMap.keys()].map((key) => key.split("|")[0] ?? "")),
      ]
        .filter(Boolean)
        .sort();

      const trend = {
        granularity,
        periods,
        series: WSKZ_QUERY_CATEGORIES.map((category) => ({
          category,
          rows: periods.map((period) => {
            const bucket = trendMap.get(`${period}|${category}`) ?? createMetricBucket();
            const metrics = metricBucketToRow([period], bucket);
            return {
              period,
              clicks: metrics.clicks,
              impressions: metrics.impressions,
              ctr: metrics.ctr,
              position: metrics.position,
            };
          }),
        })),
      };

      const overview = brandAggregateToOverview(brandQueries);

      return {
        overview,
        categories,
        queries,
        totalQueries: queries.length,
        trend,
        categoryList: [...WSKZ_QUERY_CATEGORIES],
        range: { startDate, endDate },
        availableDomains: deps.config.wskzDomains,
        selectedDomains,
        domains: brandSites.matched.map((m) => m.domain),
        missingDomains: brandSites.missing,
      };
    } catch (error) {
      app.log.error(error);
      return reply.status(502).send({ error: "Nie udało się pobrać raportu kategorii WSKZ" });
    }
  });
}
