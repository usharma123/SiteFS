import type { CrawlManifest } from "./snapshot.js";
import type { FlowState } from "./flow.js";
import type { PageSnapshot, SnapshotId } from "./snapshot.js";

/** Contract for session on-disk persistence (implemented by LocalSiteFSStore). */
export interface SiteFSStore {
  readonly root: string;
  path(...parts: string[]): string;
  init(): Promise<void>;
  writeCurrent(snapshot: PageSnapshot): Promise<void>;
  writeHistory(snapshot: PageSnapshot): Promise<SnapshotId>;
  savePage(name: string, snapshot: PageSnapshot): Promise<void>;
  writeReport(name: string, content: string): Promise<void>;
  listHistory(): Promise<SnapshotId[]>;
  readSnapshot(id: SnapshotId | "current"): Promise<PageSnapshot>;
  writeDiff(beforeId: SnapshotId, afterId: SnapshotId): Promise<string>;
  writeCrawlManifest(manifest: CrawlManifest): Promise<void>;
  refreshSessionReadme(): Promise<void>;
  startFlow(name: string): Promise<FlowState>;
  getActiveFlow(): Promise<FlowState | null>;
  getFlow(name: string): Promise<FlowState | null>;
  addFlowStep(description: string, action?: string, snapshotId?: SnapshotId): Promise<FlowState | null>;
  endFlow(): Promise<FlowState | null>;
  writeFlowReport(flow: FlowState): Promise<string>;
  copyCurrentToPage(name: string): Promise<void>;
}
