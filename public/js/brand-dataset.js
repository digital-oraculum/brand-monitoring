/** Agregacja raportu brand z datasetu (bez ponownego pobierania GSC). */

function createMetricBucket() {
  return { clicks: 0, impressions: 0, positionWeightedSum: 0 };
}

function addToMetricBucket(bucket, row) {
  bucket.clicks += row.clicks;
  bucket.impressions += row.impressions;
  bucket.positionWeightedSum += row.position * row.impressions;
}

function metricBucketToMetrics(bucket) {
  const ctr = bucket.impressions > 0 ? bucket.clicks / bucket.impressions : 0;
  const position =
    bucket.impressions > 0 ? bucket.positionWeightedSum / bucket.impressions : 0;
  return {
    clicks: bucket.clicks,
    impressions: bucket.impressions,
    ctr,
    position,
  };
}

function monthKeyFromDate(date) {
  const normalized = date.replaceAll("-", "");
  return normalized.length >= 6 ? normalized.slice(0, 6) : normalized;
}

function selectedPerSite(dataset, selectedDomains) {
  const selected = new Set(selectedDomains.map((d) => d.toLowerCase()));
  return dataset.perSite.filter((site) => selected.has(site.domain.toLowerCase()));
}

function mergeQueriesFromSites(sites) {
  const aggregated = new Map();

  for (const site of sites) {
    for (const row of site.queries) {
      const prev = aggregated.get(row.query) ?? {
        clicks: 0,
        impressions: 0,
        positionWeightedSum: 0,
        domains: new Set(),
      };
      prev.clicks += row.clicks;
      prev.impressions += row.impressions;
      prev.positionWeightedSum += row.position * row.impressions;
      prev.domains.add(site.domain.toLowerCase());
      aggregated.set(row.query, prev);
    }
  }

  return aggregated;
}

function overviewFromAggregate(aggregated) {
  const bucket = createMetricBucket();
  for (const row of aggregated.values()) {
    bucket.clicks += row.clicks;
    bucket.impressions += row.impressions;
    bucket.positionWeightedSum += row.positionWeightedSum;
  }
  return metricBucketToMetrics(bucket);
}

function domainBreakdownFromSites(sites) {
  return sites.map((site) => {
    const bucket = createMetricBucket();
    for (const row of site.queries) {
      addToMetricBucket(bucket, row);
    }
    return { domain: site.domain, ...metricBucketToMetrics(bucket) };
  });
}

function trendFromSites(sites, granularity) {
  const trendMap = new Map();

  for (const site of sites) {
    for (const row of site.dated) {
      const period =
        granularity === "month" ? monthKeyFromDate(row.date) : row.date.replaceAll("-", "");
      const bucket = trendMap.get(period) ?? createMetricBucket();
      addToMetricBucket(bucket, row);
      trendMap.set(period, bucket);
    }
  }

  return [...trendMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([period, bucket]) => ({
      keys: [period],
      ...metricBucketToMetrics(bucket),
    }));
}

function queriesTableFromAggregate(aggregated, domainColumns) {
  return [...aggregated.entries()]
    .map(([query, bucket]) => ({
      keys: [query],
      clicks: bucket.clicks,
      impressions: bucket.impressions,
      ctr: bucket.impressions > 0 ? bucket.clicks / bucket.impressions : 0,
      position: bucket.impressions > 0 ? bucket.positionWeightedSum / bucket.impressions : 0,
      domainPresence: Object.fromEntries(
        domainColumns.map((d) => [d, bucket.domains.has(d.toLowerCase())]),
      ),
    }))
    .sort((a, b) => b.impressions - a.impressions);
}

function categoriesFromAggregate(aggregated, queryCategories, categoryList) {
  const buckets = new Map(categoryList.map((category) => [category, createMetricBucket()]));

  for (const [query, row] of aggregated.entries()) {
    const category = queryCategories[query] ?? "Pozostałe";
    const bucket = buckets.get(category) ?? createMetricBucket();
    bucket.clicks += row.clicks;
    bucket.impressions += row.impressions;
    bucket.positionWeightedSum += row.positionWeightedSum;
    buckets.set(category, bucket);
  }

  return categoryList
    .map((category) => {
      const metrics = metricBucketToMetrics(buckets.get(category) ?? createMetricBucket());
      return { category, ...metrics };
    })
    .sort((a, b) => b.impressions - a.impressions);
}

function categoryQueriesFromAggregate(aggregated, queryCategories) {
  return [...aggregated.entries()]
    .map(([query, bucket]) => ({
      keys: [query],
      category: queryCategories[query] ?? "Pozostałe",
      clicks: bucket.clicks,
      impressions: bucket.impressions,
      ctr: bucket.impressions > 0 ? bucket.clicks / bucket.impressions : 0,
      position: bucket.impressions > 0 ? bucket.positionWeightedSum / bucket.impressions : 0,
    }))
    .sort((a, b) => b.impressions - a.impressions);
}

function categoryTrendFromSites(sites, granularity, queryCategories, categoryList) {
  const trendMap = new Map();

  for (const site of sites) {
    for (const row of site.dated) {
      const category = queryCategories[row.query] ?? "Pozostałe";
      const period =
        granularity === "month" ? monthKeyFromDate(row.date) : row.date.replaceAll("-", "");
      const key = `${period}|${category}`;
      const bucket = trendMap.get(key) ?? createMetricBucket();
      addToMetricBucket(bucket, row);
      trendMap.set(key, bucket);
    }
  }

  const periods = [...new Set([...trendMap.keys()].map((key) => key.split("|")[0]))]
    .filter(Boolean)
    .sort();

  return {
    granularity,
    periods,
    series: categoryList.map((category) => ({
      category,
      rows: periods.map((period) => ({
        period,
        ...metricBucketToMetrics(trendMap.get(`${period}|${category}`) ?? createMetricBucket()),
      })),
    })),
  };
}

function buildBrandViewsFromDataset(dataset, selectedDomains, granularity) {
  const sites = selectedPerSite(dataset, selectedDomains);
  const aggregated = mergeQueriesFromSites(sites);
  const overview = overviewFromAggregate(aggregated);

  return {
    overview,
    domainBreakdown: domainBreakdownFromSites(sites),
    trend: {
      rows: trendFromSites(sites, granularity),
      granularity,
    },
    queries: {
      rows: queriesTableFromAggregate(aggregated, dataset.availableDomains),
      totalRows: aggregated.size,
    },
    categories: {
      overview,
      categories: categoriesFromAggregate(
        aggregated,
        dataset.queryCategories,
        dataset.categoryList,
      ),
      queries: categoryQueriesFromAggregate(aggregated, dataset.queryCategories),
      totalQueries: aggregated.size,
      trend: categoryTrendFromSites(
        sites,
        granularity,
        dataset.queryCategories,
        dataset.categoryList,
      ),
      categoryList: dataset.categoryList,
    },
    meta: {
      range: dataset.range,
      availableDomains: dataset.availableDomains,
      missingDomains: dataset.missingDomains,
      selectedDomains,
      domainColumns: dataset.availableDomains,
      domains: sites.map((s) => s.domain),
      matchedSites: sites.map((s) => ({ domain: s.domain, siteUrl: s.siteUrl })),
    },
  };
}
