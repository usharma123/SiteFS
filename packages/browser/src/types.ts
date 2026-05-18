import type { PageSnapshot } from "@sitefs/sitefs";

export interface BrowserBackend {
  open(url: string): Promise<void>;
  click(target: string): Promise<void>;
  type(target: string, value: string): Promise<void>;
  scroll(direction: "up" | "down"): Promise<void>;
  wait(ms: number): Promise<void>;
  back(): Promise<void>;
  forward(): Promise<void>;
  snapshot(): Promise<PageSnapshot>;
  close(): Promise<void>;
}

export interface BrowserBackendOptions {
  headed?: boolean;
  timeoutMs?: number;
}

