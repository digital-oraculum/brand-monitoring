import { WSKZ_BRAND_INCLUDING_REGEX } from "./wskz-brand-filter.js";

export const WSKZ_BRAND_DIMENSION_FILTER_GROUPS = [
  {
    groupType: "and" as const,
    filters: [
      {
        dimension: "query",
        operator: "includingRegex",
        expression: WSKZ_BRAND_INCLUDING_REGEX,
      },
    ],
  },
];
