import type { LinkProbeResult, PageSnapshot } from "@sitefs/sitefs";

export interface BrowserBackend {
  open(url: string, options?: OpenOptions): Promise<void>;
  click(target: string): Promise<void>;
  type(target: string, value: string): Promise<void>;
  scroll(direction: "up" | "down"): Promise<void>;
  wait(ms: number): Promise<void>;
  back(): Promise<void>;
  forward(): Promise<void>;
  snapshot(): Promise<PageSnapshot>;
  probeLink(href: string): Promise<LinkProbeResult>;
  close(): Promise<void>;
}

export interface TabInfo {
  id: number;
  title: string;
  url: string;
  active: boolean;
  windowId: number;
}

export interface WindowInfo {
  id: number;
  focused: boolean;
  tabs: TabInfo[];
}

export interface LiveBrowserBackend extends BrowserBackend {
  listTabs(): Promise<TabInfo[]>;
  listWindows(): Promise<WindowInfo[]>;
  switchTab(id: number): Promise<TabInfo>;
  openTab(url: string): Promise<TabInfo>;
  closeTab(id?: number): Promise<void>;
  getActiveTab(): Promise<TabInfo>;
  navigate(url: string): Promise<void>;
  refreshAxTree(): Promise<unknown>;
  clickAx(target: string): Promise<void>;
  focusAx(target: string): Promise<void>;
  typeAx(text: string, target?: string): Promise<void>;
  submitAx(options: SubmitAxOptions): Promise<void>;
  selectAx(target: string, value: string): Promise<void>;
  scrollAx(direction: "up" | "down" | string, amount?: number): Promise<string>;
  waitAx(options: WaitAxOptions): Promise<void>;
  evaluateJs(expression: string, allowWrite?: boolean): Promise<unknown>;
  listFunctions(pattern?: string): Promise<Array<{ name: string; arity: number }>>;
  callFunction(name: string, args: unknown[]): Promise<unknown>;
  screenshotPng(): Promise<Buffer>;
  getCookies(): Promise<Array<{ name: string; domain: string; value: string }>>;
}

export interface SubmitAxOptions {
  fields: Array<{ target: string; value: string }>;
  submit?: string;
}

export interface WaitAxOptions {
  pattern?: string;
  type?: string;
  timeoutMs?: number;
}

export type WaitUntil = "domcontentloaded" | "load" | "networkidle";

export interface OpenOptions {
  waitForSelector?: string;
}

export interface BrowserBackendOptions {
  headed?: boolean;
  timeoutMs?: number;
  waitUntil?: WaitUntil;
  networkIdleTimeoutMs?: number;
  userDataDir?: string;
}
