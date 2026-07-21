import type { GscClient } from "../gsc/client.js";
import type { OverviewMetrics, SearchAnalyticsResult } from "../types.js";
import { WSKZ_BRAND_DIMENSION_FILTER_GROUPS } from "./wskz-brand-dimension-filter.js";
import { isWskzBrandQuery } from "./wskz-brand-filter.js";
import {
  addToMetricBucket,
  createMetricBucket,
  metricBucketToRow,
  type MetricBucket,
} from "./wskz-metrics.js";

export interface BrandSiteMatch {
  domain: string;
  siteUrl: string;
}

export interface BrandQueryBucket {
  clicks: number;
  impressions: number;
  positionWeightedSum: number;
  domains: Set<string>;
}

export type BrandQueryAggregate = Map<string, BrandQueryBucket>;

export function monthKeyFromDate(date: string): string {
  const normalized = date.replaceAll("-", "");
  return normalized.length >= 6 ? normalized.slice(0, 6) : normalized;
}

export async function fetchBrandQueryRowsPerSite(
  client: GscClient,
  matched: BrandSiteMatch[],
  startDate: string,
  endDate: string,
): Promise<SearchAnalyticsResult[]> {
  return Promise.all(
    matched.map(({ siteUrl }) =>
      client.queryAnalyticsAll({
        siteUrl,
        startDate,
        endDate,
        dimensions: ["query"],
        dimensionFilterGroups: WSKZ_BRAND_DIMENSION_FILTER_GROUPS,
      }),
    ),
  );
}

export async function fetchBrandDatedQueryRowsPerSite(
  client: GscClient,
  matched: BrandSiteMatch[],
  startDate: string,
  endDate: string,
): Promise<SearchAnalyticsResult[]> {
  return Promise.all(
    matched.map(({ siteUrl }) =>
      client.queryAnalyticsAll({
        siteUrl,
        startDate,
        endDate,
        dimensions: ["date", "query"],
        dimensionFilterGroups: WSKZ_BRAND_DIMENSION_FILTER_GROUPS,
      }),
    ),
  );
}

export function mergeBrandQueryRows(
  matched: BrandSiteMatch[],
  perSiteResults: SearchAnalyticsResult[],
): BrandQueryAggregate {
  const aggregated: BrandQueryAggregate = new Map();

  matched.forEach(({ domain }, index) => {
    for (const row of perSiteResults[index]?.rows ?? []) {
      const query = row.keys[0];
      if (!query || !isWskzBrandQuery(query)) continue;

      const prev = aggregated.get(query) ?? {
        clicks: 0,
        impressions: 0,
        positionWeightedSum: 0,
        domains: new Set<string>(),
      };
      prev.clicks += row.clicks;
      prev.impressions += row.impressions;
      prev.positionWeightedSum += row.position * row.impressions;
      prev.domains.add(domain.toLowerCase());
      aggregated.set(query, prev);
    }
  });

  return aggregated;
}

export function brandAggregateToOverview(aggregated: BrandQueryAggregate): OverviewMetrics {
  let clicks = 0;
  let impressions = 0;
  let positionWeightedSum = 0;

  for (const bucket of aggregated.values()) {
    clicks += bucket.clicks;
    impressions += bucket.impressions;
    positionWeightedSum += bucket.positionWeightedSum;
  }

  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: impressions > 0 ? positionWeightedSum / impressions : 0,
  };
}

export function brandPerSiteToDomainBreakdown(
  matched: BrandSiteMatch[],
  perSiteResults: SearchAnalyticsResult[],
) {
  return matched.map(({ domain }, index) => {
    const bucket = createMetricBucket();
    for (const row of perSiteResults[index]?.rows ?? []) {
      const query = row.keys[0];
      if (!query || !isWskzBrandQuery(query)) continue;
      addToMetricBucket(bucket, row);
    }
    const metrics = metricBucketToRow([domain], bucket);
    return {
      domain,
      clicks: metrics.clicks,
      impressions: metrics.impressions,
      ctr: metrics.ctr,
      position: metrics.position,
    };
  });
}

export function buildBrandTrendRows(
  datedResults: SearchAnalyticsResult[],
  granularity: "day" | "month",
) {
  const trendMap = new Map<string, MetricBucket>();

  for (const result of datedResults) {
    for (const row of result.rows) {
      const date = row.keys[0] ?? "";
      const query = row.keys[1] ?? "";
      if (!date || !query || !isWskzBrandQuery(query)) continue;

      const period =
        granularity === "month" ? monthKeyFromDate(date) : date.replaceAll("-", "");
      const bucket = trendMap.get(period) ?? createMetricBucket();
      addToMetricBucket(bucket, row);
      trendMap.set(period, bucket);
    }
  }

  return [...trendMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([period, bucket]) => metricBucketToRow([period], bucket));
}
