export type SnapshotId = string;

export interface LinkInfo {
  text: string;
  href: string;
  visible: boolean;
}

export interface ButtonInfo {
  text: string;
  role: string;
  selector: string;
  visible: boolean;
  enabled: boolean;
}

export interface InputInfo {
  label: string;
  name: string;
  type: string;
  required: boolean;
  selector: string;
  visible: boolean;
  enabled: boolean;
  value?: string;
}

export interface FormInfo {
  name: string;
  selector: string;
  fields: InputInfo[];
  submit?: {
    text: string;
    selector: string;
  };
}

export interface ConsoleLog {
  type: string;
  text: string;
  location?: string;
  timestamp: string;
}

export interface NetworkLog {
  url: string;
  method: string;
  status?: number;
  statusText?: string;
  failure?: string;
  resourceType?: string;
  timestamp: string;
}

export interface LinkProbeResult {
  status?: number;
  ok: boolean;
  blocked?: boolean;
  error?: string;
}

export interface AxeViolationSummary {
  id: string;
  impact?: string;
  description: string;
  help: string;
  nodes: number;
}

export interface PageSnapshot {
  id: SnapshotId;
  url: string;
  title: string;
  visibleText: string;
  summary: string;
  accessibilityTree: unknown;
  dom: unknown;
  links: LinkInfo[];
  buttons: ButtonInfo[];
  forms: FormInfo[];
  inputs: InputInfo[];
  consoleLogs: ConsoleLog[];
  networkLogs: NetworkLog[];
  screenshotPath: string;
  timestamp: string;
  screenshotBuffer?: Uint8Array;
  screenshotSha256?: string;
  axeViolations?: AxeViolationSummary[];
}

export interface CrawlManifestEntry {
  url: string;
  slug: string;
  snapshotId?: SnapshotId;
  title: string;
}

export interface CrawlManifest {
  startedAt: string;
  startUrl: string;
  maxPages: number;
  pages: CrawlManifestEntry[];
}
