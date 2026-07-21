export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiryDate: number | null;
  email?: string;
  updatedAt: string;
}

export interface SearchAnalyticsRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchAnalyticsResult {
  rows: SearchAnalyticsRow[];
  responseAggregationType?: string;
}

export interface OverviewMetrics {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface AnalyticsQueryParams extends DateRange {
  siteUrl: string;
  dimensions?: string[];
  rowLimit?: number;
  startRow?: number;
  dimensionFilterGroups?: ApiDimensionFilterGroup[];
}

export interface GscSite {
  siteUrl: string;
  permissionLevel: string;
}

export interface ApiDimensionFilter {
  dimension?: string;
  expression?: string;
  operator?: string;
}

export interface ApiDimensionFilterGroup {
  filters?: ApiDimensionFilter[];
  groupType?: string;
}

declare module "fastify" {
  interface FastifyRequest {
    userSession?: import("./auth/session.js").UserSession;
  }
}
