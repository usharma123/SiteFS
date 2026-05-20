export type {
  SnapshotId,
  LinkInfo,
  ButtonInfo,
  InputInfo,
  FormInfo,
  ConsoleLog,
  NetworkLog,
  LinkProbeResult,
  AxeViolationSummary,
  PageSnapshot,
  CrawlManifestEntry,
  CrawlManifest,
  Issue,
  QAReport,
  FlowStep,
  FlowState,
  SiteRunRecord,
  RunRegistryIndex,
  SiteFSStore
} from "./types/index.js";

export {
  type SessionConfig,
  defaultSessionConfig,
  loadSessionConfig,
  saveSessionConfig
} from "./config.js";

export {
  type StructuralDiff,
  diffSnapshots,
  diffSnapshotsJson,
  buildStructuralDiff,
  diffVisualFromPaths,
  diffVisualBuffers
} from "./snapshot-diff.js";

export { slugifyName, stringifyJson, stringifyYaml } from "./format.js";

export { detectDangerousAction } from "./guardrails.js";

export {
  registerRun,
  getPreviousRun,
  listRunsForOrigin,
  getRunById
} from "./registry.js";

export {
  normalizeOrigin,
  normalizePageUrl,
  originHashFromUrl,
  pageSlugFromUrl,
  originLabelFromUrl
} from "./url.js";

export { readSnapshotFromDir } from "./snapshot-io.js";

export { LocalSiteFSStore } from "./store.js";

export {
  type ViewerManifest,
  type PageIndexEntry,
  type PageDiffEntry,
  type ViewerTreeNode,
  type PageChangeStatus,
  type ReportEntry,
  type BuildViewerManifestOptions,
  buildViewerManifest,
  writeViewerManifest
} from "./viewer-manifest.js";

export { finalizeViewerRun } from "./viewer.js";
