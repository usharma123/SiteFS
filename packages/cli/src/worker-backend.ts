import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createInterface, type Interface } from "node:readline";
import type { LiveBrowserBackend, BrowserBackendOptions, OpenOptions, SubmitAxOptions, WaitAxOptions } from "@sitefs/browser";
import type { LinkProbeResult, PageSnapshot } from "@sitefs/sitefs";

interface WorkerResponse {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export class WorkerBrowserBackend implements LiveBrowserBackend {
  private child?: ChildProcess;
  private lines?: Interface;
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();

  constructor(private readonly options: BrowserBackendOptions & { headed: boolean }) {}

  open(url: string, openOptions?: OpenOptions): Promise<void> {
    return this.request("open", [url, openOptions ?? {}]) as Promise<void>;
  }

  navigate(url: string): Promise<void> {
    return this.request("navigate", [url]) as Promise<void>;
  }

  click(target: string): Promise<void> {
    return this.request("click", [target]) as Promise<void>;
  }

  clickAx(target: string): Promise<void> {
    return this.request("clickAx", [target]) as Promise<void>;
  }

  focusAx(target: string): Promise<void> {
    return this.request("focusAx", [target]) as Promise<void>;
  }

  type(target: string, value: string): Promise<void> {
    return this.request("type", [target, value]) as Promise<void>;
  }

  typeAx(text: string, target?: string): Promise<void> {
    return this.request("typeAx", [text, target]) as Promise<void>;
  }

  submitAx(options: SubmitAxOptions): Promise<void> {
    return this.request("submitAx", [options]) as Promise<void>;
  }

  selectAx(target: string, value: string): Promise<void> {
    return this.request("selectAx", [target, value]) as Promise<void>;
  }

  scroll(direction: "up" | "down"): Promise<void> {
    return this.request("scroll", [direction]) as Promise<void>;
  }

  scrollAx(direction: "up" | "down" | string, amount?: number): Promise<string> {
    return this.request("scrollAx", [direction, amount]) as Promise<string>;
  }

  wait(ms: number): Promise<void> {
    return this.request("wait", [ms]) as Promise<void>;
  }

  waitAx(options: WaitAxOptions): Promise<void> {
    return this.request("waitAx", [options]) as Promise<void>;
  }

  back(): Promise<void> {
    return this.request("back", []) as Promise<void>;
  }

  forward(): Promise<void> {
    return this.request("forward", []) as Promise<void>;
  }

  listTabs() {
    return this.request("listTabs", []) as ReturnType<LiveBrowserBackend["listTabs"]>;
  }

  listWindows() {
    return this.request("listWindows", []) as ReturnType<LiveBrowserBackend["listWindows"]>;
  }

  switchTab(id: number) {
    return this.request("switchTab", [id]) as ReturnType<LiveBrowserBackend["switchTab"]>;
  }

  openTab(url: string) {
    return this.request("openTab", [url]) as ReturnType<LiveBrowserBackend["openTab"]>;
  }

  closeTab(id?: number): Promise<void> {
    return this.request("closeTab", [id]) as Promise<void>;
  }

  getActiveTab() {
    return this.request("getActiveTab", []) as ReturnType<LiveBrowserBackend["getActiveTab"]>;
  }

  refreshAxTree(): Promise<unknown> {
    return this.request("refreshAxTree", []);
  }

  evaluateJs(expression: string, allowWrite?: boolean): Promise<unknown> {
    return this.request("evaluateJs", [expression, allowWrite ?? true]);
  }

  listFunctions(pattern?: string) {
    return this.request("listFunctions", [pattern]) as ReturnType<LiveBrowserBackend["listFunctions"]>;
  }

  callFunction(name: string, args: unknown[]): Promise<unknown> {
    return this.request("callFunction", [name, args]);
  }

  screenshotPng(): Promise<Buffer> {
    return this.request("screenshotPng", []).then((result) => {
      const base64 = (result as { base64?: string }).base64;
      return Buffer.from(base64 ?? "", "base64");
    });
  }

  getCookies() {
    return this.request("getCookies", []) as ReturnType<LiveBrowserBackend["getCookies"]>;
  }

  async snapshot(): Promise<PageSnapshot> {
    const result = await this.request("snapshot", []) as PageSnapshot & { screenshotBase64?: string };
    if (result.screenshotBase64) {
      result.screenshotBuffer = Buffer.from(result.screenshotBase64, "base64");
      delete result.screenshotBase64;
    }
    return result;
  }

  probeLink(href: string): Promise<LinkProbeResult> {
    return this.request("probeLink", [href]) as Promise<LinkProbeResult>;
  }

  async close(): Promise<void> {
    if (!this.child) return;
    await this.request("close", []).catch(() => {});
    this.child.kill();
    this.child = undefined;
    this.lines?.close();
    this.lines = undefined;
  }

  private async request(method: string, params: unknown[]): Promise<unknown> {
    const child = this.ensureChild();
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    child.stdin?.write(`${payload}\n`);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  private ensureChild(): ChildProcess {
    if (this.child) return this.child;
    const workerPath = fileURLToPath(new URL("./browser-worker.js", import.meta.url));
    const args: string[] = [];
    if (this.options.headed) args.push("--headed");
    if (this.options.waitUntil) args.push(`--wait-until=${this.options.waitUntil}`);
    if (this.options.networkIdleTimeoutMs) args.push(`--network-idle-ms=${this.options.networkIdleTimeoutMs}`);
    if (this.options.userDataDir) args.push(`--user-data-dir=${this.options.userDataDir}`);

    this.child = spawn(process.execPath, [workerPath, ...args], {
      stdio: ["pipe", "pipe", "inherit"]
    });
    if (!this.child.stdout) throw new Error("Worker stdout unavailable");
    this.lines = createInterface({ input: this.child.stdout });
    this.lines.on("line", (line) => {
      const message = JSON.parse(line) as WorkerResponse;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.ok) pending.resolve(message.result);
      else pending.reject(new Error(message.error ?? "Worker error"));
    });
    return this.child;
  }
}
