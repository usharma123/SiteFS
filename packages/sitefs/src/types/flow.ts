import type { SnapshotId } from "./snapshot.js";

export interface FlowStep {
  id: number;
  description: string;
  action?: string;
  snapshotId?: SnapshotId;
  timestamp: string;
}

export interface FlowState {
  name: string;
  active: boolean;
  startedAt: string;
  endedAt?: string;
  steps: FlowStep[];
  snapshots: SnapshotId[];
}
