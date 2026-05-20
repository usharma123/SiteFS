import type { buildStructuralDiff } from "../snapshot-diff.js";
import type { SiteRunRecord } from "../types/run.js";

export type PageChangeStatus = "unchanged" | "added" | "removed" | "changed";

export interface ViewerTreeNode {
  path: string;
  name: string;
  kind: "file" | "directory";
  assetPath?: string;
  pageUrl?: string;
  changeStatus?: PageChangeStatus;
}

export interface PageIndexEntry {
  url: string;
  slug: string;
  dir: string;
  title: string;
  status: PageChangeStatus;
  issueCount: number;
}

export interface ReportEntry {
  name: string;
  path: string;
}

export interface PageDiffEntry {
  url: string;
  slug: string;
  status: PageChangeStatus;
  beforePath?: string;
  afterPath?: string;
  beforeText?: string;
  afterText?: string;
  beforeSummary?: string;
  afterSummary?: string;
  beforeLinks?: string;
  afterLinks?: string;
  visualDiffPath?: string;
  structuralDiff?: ReturnType<typeof buildStructuralDiff>;
}

export interface ViewerManifest {
  run: SiteRunRecord;
  previousRun?: SiteRunRecord;
  originLabel: string;
  treePaths: string[];
  treeNodes: ViewerTreeNode[];
  gitStatus: Record<string, "added" | "modified" | "deleted">;
  pages: PageIndexEntry[];
  reports: ReportEntry[];
  diffs: PageDiffEntry[];
  runsForOrigin: SiteRunRecord[];
}

export interface BuildViewerManifestOptions {
  run: SiteRunRecord;
  previousRun?: SiteRunRecord;
  runsForOrigin?: SiteRunRecord[];
}

export interface PageSnapshotDir {
  url: string;
  slug: string;
  dir: string;
  title: string;
  textHash: string;
  screenshotHash: string;
  issueCount: number;
}
