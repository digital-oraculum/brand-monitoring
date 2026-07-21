export interface MetricBucket {
  clicks: number;
  impressions: number;
  positionWeightedSum: number;
}

export function createMetricBucket(): MetricBucket {
  return { clicks: 0, impressions: 0, positionWeightedSum: 0 };
}

export function addToMetricBucket(
  bucket: MetricBucket,
  row: { clicks: number; impressions: number; position: number },
) {
  bucket.clicks += row.clicks;
  bucket.impressions += row.impressions;
  bucket.positionWeightedSum += row.position * row.impressions;
}

export function metricBucketToRow(keys: string[], bucket: MetricBucket) {
  const ctr = bucket.impressions > 0 ? bucket.clicks / bucket.impressions : 0;
  const position =
    bucket.impressions > 0 ? bucket.positionWeightedSum / bucket.impressions : 0;
  return {
    keys,
    clicks: bucket.clicks,
    impressions: bucket.impressions,
    ctr,
    position,
  };
}
