import type { GscClient } from "../gsc/client.js";
import { isWskzBrandQuery } from "./wskz-brand-filter.js";
import {
  fetchBrandDatedQueryRowsPerSite,
  fetchBrandQueryRowsPerSite,
  monthKeyFromDate,
  type BrandSiteMatch,
} from "./wskz-brand-data.js";
import {
  categorizeWskzQuery,
  WSKZ_QUERY_CATEGORIES,
} from "./wskz-query-category.js";

export interface BrandSiteQueryRow {
  query: string;
  clicks: number;
  impressions: number;
  position: number;
}

export interface BrandSiteDatedRow {
  date: string;
  query: string;
  clicks: number;
  impressions: number;
  position: number;
}

export interface BrandPerSiteDataset {
  domain: string;
  siteUrl: string;
  queries: BrandSiteQueryRow[];
  dated: BrandSiteDatedRow[];
}

export interface BrandDataset {
  range: { startDate: string; endDate: string };
  availableDomains: string[];
  missingDomains: string[];
  matchedSites: BrandSiteMatch[];
  perSite: BrandPerSiteDataset[];
  queryCategories: Record<string, string>;
  categoryList: string[];
}

function toQueryRow(row: {
  keys: string[];
  clicks: number;
  impressions: number;
  position: number;
}): BrandSiteQueryRow | null {
  const query = row.keys[0];
  if (!query || !isWskzBrandQuery(query)) return null;
  return {
    query,
    clicks: row.clicks,
    impressions: row.impressions,
    position: row.position,
  };
}

function toDatedRow(row: {
  keys: string[];
  clicks: number;
  impressions: number;
  position: number;
}): BrandSiteDatedRow | null {
  const date = row.keys[0];
  const query = row.keys[1];
  if (!date || !query || !isWskzBrandQuery(query)) return null;
  return {
    date,
    query,
    clicks: row.clicks,
    impressions: row.impressions,
    position: row.position,
  };
}

export async function fetchBrandDataset(
  client: GscClient,
  matched: BrandSiteMatch[],
  startDate: string,
  endDate: string,
  availableDomains: string[],
  missingDomains: string[],
): Promise<BrandDataset> {
  const [queryResults, datedResults] = await Promise.all([
    fetchBrandQueryRowsPerSite(client, matched, startDate, endDate),
    fetchBrandDatedQueryRowsPerSite(client, matched, startDate, endDate),
  ]);

  const perSite: BrandPerSiteDataset[] = matched.map(({ domain, siteUrl }, index) => ({
    domain,
    siteUrl,
    queries: (queryResults[index]?.rows ?? [])
      .map(toQueryRow)
      .filter((row): row is BrandSiteQueryRow => row !== null),
    dated: (datedResults[index]?.rows ?? [])
      .map(toDatedRow)
      .filter((row): row is BrandSiteDatedRow => row !== null),
  }));

  const queryCategories: Record<string, string> = {};
  for (const site of perSite) {
    for (const row of site.queries) {
      if (!queryCategories[row.query]) {
        queryCategories[row.query] = categorizeWskzQuery(row.query);
      }
    }
  }

  return {
    range: { startDate, endDate },
    availableDomains,
    missingDomains,
    matchedSites: matched,
    perSite,
    queryCategories,
    categoryList: [...WSKZ_QUERY_CATEGORIES],
  };
}

export { monthKeyFromDate };
