export interface Issue {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  details?: unknown;
}

export interface QAReport {
  url: string;
  flowName?: string;
  passed: boolean;
  issues: Issue[];
  snapshots: string[];
  summary: string;
}
