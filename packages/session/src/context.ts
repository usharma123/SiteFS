import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { WorkerBrowserBackend } from "@sitefs/browser";
import { BrowserHost } from "@sitefs/live";
import { loadSessionConfig, LocalSiteFSStore, type SessionConfig } from "@sitefs/sitefs";
import { WebRuntime } from "./web/runtime.js";

export interface SessionContextOptions {
  sessionRoot: string;
  headed: boolean;
  allowWrite?: boolean;
  allowSensitive?: boolean;
  openViewerOnCheckAll?: boolean;
}

export interface SessionContext {
  sessionRoot: string;
  siteRoot: string;
  store: LocalSiteFSStore;
  config: SessionConfig;
  backend: WorkerBrowserBackend;
  web: WebRuntime;
  host: BrowserHost;
}

export async function createSessionContext(options: SessionContextOptions): Promise<SessionContext> {
  const sessionRoot = resolve(options.sessionRoot);
  const siteRoot = resolve(sessionRoot, "site");
  await mkdir(siteRoot, { recursive: true });

  const store = new LocalSiteFSStore(siteRoot);
  await store.init();
  const config = await loadSessionConfig(sessionRoot);
  const backend = new WorkerBrowserBackend({
    headed: options.headed,
    waitUntil: config.waitUntil,
    networkIdleTimeoutMs: config.networkIdleTimeoutMs,
    userDataDir: config.userDataDir
  });
  const web = new WebRuntime(backend, store, {
    config,
    sessionRoot,
    openViewerOnCheckAll: options.openViewerOnCheckAll ?? false
  });
  const host = new BrowserHost(backend, store, web, {
    sessionRoot,
    config,
    allowWrite: options.allowWrite ?? config.allowWrite,
    allowSensitive: options.allowSensitive ?? config.allowSensitive
  });

  return { sessionRoot, siteRoot, store, config, backend, web, host };
}

export async function closeSessionContext(ctx: SessionContext): Promise<void> {
  await ctx.host.close();
}
