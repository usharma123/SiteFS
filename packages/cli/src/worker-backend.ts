import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createInterface, type Interface } from "node:readline";
import type { BrowserBackend } from "@sitefs/browser";
import type { PageSnapshot } from "@sitefs/sitefs";

interface WorkerResponse {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export class WorkerBrowserBackend implements BrowserBackend {
  private child?: ChildProcessWithoutNullStreams;
  private lines?: Interface;
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();

  constructor(private readonly options: { headed: boolean }) {}

  open(url: string): Promise<void> {
    return this.request("open", [url]) as Promise<void>;
  }

  click(target: string): Promise<void> {
    return this.request("click", [target]) as Promise<void>;
  }

  type(target: string, value: string): Promise<void> {
    return this.request("type", [target, value]) as Promise<void>;
  }

  scroll(direction: "up" | "down"): Promise<void> {
    return this.request("scroll", [direction]) as Promise<void>;
  }

  wait(ms: number): Promise<void> {
    return this.request("wait", [ms]) as Promise<void>;
  }

  back(): Promise<void> {
    return this.request("back", []) as Promise<void>;
  }

  forward(): Promise<void> {
    return this.request("forward", []) as Promise<void>;
  }

  async snapshot(): Promise<PageSnapshot> {
    const result = await this.request("snapshot", []) as PageSnapshot & { screenshotBase64?: string };
    if (result.screenshotBase64) {
      result.screenshotBuffer = Buffer.from(result.screenshotBase64, "base64");
      delete result.screenshotBase64;
    }
    return result;
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
    child.stdin.write(`${payload}\n`);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  private ensureChild(): ChildProcessWithoutNullStreams {
    if (this.child) return this.child;
    const workerPath = fileURLToPath(new URL("./browser-worker.js", import.meta.url));
    const child = spawn(process.execPath, [workerPath, this.options.headed ? "--headed" : ""].filter(Boolean), {
      stdio: ["pipe", "pipe", "pipe"]
    });
    this.child = child;
    this.lines = createInterface({ input: child.stdout });
    this.lines.on("line", (line) => this.handleLine(line));
    child.stderr.on("data", (chunk) => {
      const error = String(chunk).trim();
      if (error) process.stderr.write(`[sitefs-browser] ${error}\n`);
    });
    child.on("exit", (code) => {
      for (const pending of this.pending.values()) {
        pending.reject(new Error(`Browser worker exited with code ${code}`));
      }
      this.pending.clear();
      this.child = undefined;
    });
    return child;
  }

  private handleLine(line: string): void {
    let response: WorkerResponse;
    try {
      response = JSON.parse(line) as WorkerResponse;
    } catch {
      process.stderr.write(`[sitefs-browser] ${line}\n`);
      return;
    }
    const pending = this.pending.get(response.id);
    if (!pending) return;
    this.pending.delete(response.id);
    if (response.ok) pending.resolve(response.result);
    else pending.reject(new Error(response.error ?? "Browser worker request failed"));
  }
}

