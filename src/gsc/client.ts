import { google, searchconsole_v1 } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import type {
  AnalyticsQueryParams,
  GscSite,
  OverviewMetrics,
  SearchAnalyticsResult,
  SearchAnalyticsRow,
} from "../types.js";

/** Maksymalny rozmiar strony w Search Analytics API. */
const GSC_MAX_PAGE_SIZE = 25_000;

export class GscClient {
  private readonly searchConsole: searchconsole_v1.Searchconsole;

  constructor(auth: OAuth2Client) {
    this.searchConsole = google.searchconsole({ version: "v1", auth });
  }

  async listSites(): Promise<GscSite[]> {
    const response = await this.searchConsole.sites.list();
    const entries = response.data.siteEntry ?? [];

    return entries
      .filter((site) => site.siteUrl)
      .map((site) => ({
        siteUrl: site.siteUrl!,
        permissionLevel: site.permissionLevel ?? "unknown",
      }))
      .sort((a, b) => a.siteUrl.localeCompare(b.siteUrl));
  }

  async queryAnalytics(
    params: AnalyticsQueryParams,
  ): Promise<SearchAnalyticsResult> {
    const response = await this.searchConsole.searchanalytics.query({
      siteUrl: params.siteUrl,
      requestBody: {
        startDate: params.startDate,
        endDate: params.endDate,
        dimensions: params.dimensions,
        dimensionFilterGroups: params.dimensionFilterGroups,
        rowLimit: params.rowLimit ?? 100,
        startRow: params.startRow ?? 0,
        dataState: "final",
      },
    });

    const rows = (response.data.rows ?? []).map((row) => ({
      keys: row.keys ?? [],
      clicks: row.clicks ?? 0,
      impressions: row.impressions ?? 0,
      ctr: row.ctr ?? 0,
      position: row.position ?? 0,
    }));

    return {
      rows,
      responseAggregationType: response.data.responseAggregationType ?? undefined,
    };
  }

  /** Pobiera wszystkie wiersze przez paginację (startRow), aż API zwróci mniej niż pełną stronę. */
  async queryAnalyticsAll(
    params: Omit<AnalyticsQueryParams, "startRow" | "rowLimit">,
  ): Promise<SearchAnalyticsResult> {
    const allRows: SearchAnalyticsRow[] = [];
    let startRow = 0;
    let responseAggregationType: string | undefined;

    while (true) {
      const page = await this.queryAnalytics({
        ...params,
        rowLimit: GSC_MAX_PAGE_SIZE,
        startRow,
      });

      responseAggregationType = page.responseAggregationType ?? responseAggregationType;
      allRows.push(...page.rows);

      if (page.rows.length < GSC_MAX_PAGE_SIZE) {
        break;
      }

      startRow += GSC_MAX_PAGE_SIZE;
    }

    return { rows: allRows, responseAggregationType };
  }

  async getOverview(params: AnalyticsQueryParams): Promise<OverviewMetrics> {
    const result = await this.queryAnalytics({
      ...params,
      dimensions: undefined,
      rowLimit: 1,
    });

    const row = result.rows[0];
    if (!row) {
      return { clicks: 0, impressions: 0, ctr: 0, position: 0 };
    }

    return {
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    };
  }

  async getDailyTrend(
    params: AnalyticsQueryParams,
  ): Promise<SearchAnalyticsResult> {
    return this.queryAnalyticsAll({
      ...params,
      dimensions: ["date"],
    });
  }

  async getTopQueries(
    params: AnalyticsQueryParams,
  ): Promise<SearchAnalyticsResult> {
    return this.queryAnalytics({
      ...params,
      dimensions: ["query"],
      rowLimit: params.rowLimit ?? 50,
    });
  }

  async getTopPages(
    params: AnalyticsQueryParams,
  ): Promise<SearchAnalyticsResult> {
    return this.queryAnalytics({
      ...params,
      dimensions: ["page"],
      rowLimit: params.rowLimit ?? 50,
    });
  }

  async getDeviceBreakdown(
    params: AnalyticsQueryParams,
  ): Promise<SearchAnalyticsResult> {
    return this.queryAnalytics({
      ...params,
      dimensions: ["device"],
      rowLimit: 10,
    });
  }

  async getCountryBreakdown(
    params: AnalyticsQueryParams,
  ): Promise<SearchAnalyticsResult> {
    return this.queryAnalytics({
      ...params,
      dimensions: ["country"],
      rowLimit: 20,
    });
  }
}
