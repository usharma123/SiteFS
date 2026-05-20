export interface SiteRunRecord {
  runId: string;
  origin: string;
  sessionRoot: string;
  siteRoot: string;
  startedAt: string;
  finishedAt: string;
  startUrl: string;
  passed?: boolean;
  pageCount: number;
  historyRange?: [string, string];
}

export interface RunRegistryIndex {
  origins: Record<string, SiteRunRecord[]>;
}
