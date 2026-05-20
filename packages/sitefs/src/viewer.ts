import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import {
  buildViewerManifest,
  writeViewerManifest,
  type BuildViewerManifestOptions
} from "./viewer-manifest.js";
import {
  getPreviousRun,
  listRunsForOrigin,
  registerRun,
  type SiteRunRecord
} from "./registry.js";
import { LocalSiteFSStore } from "./store.js";
import { stringifyJson } from "./format.js";

export interface FinalizeViewerRunOptions {
  sessionRoot: string;
  startUrl: string;
  startedAt: string;
  passed?: boolean;
}

export async function finalizeViewerRun(options: FinalizeViewerRunOptions): Promise<{
  manifestPath: string;
  run: SiteRunRecord;
  previousRun?: SiteRunRecord;
}> {
  const sessionRoot = resolve(options.sessionRoot);
  const siteRoot = resolve(sessionRoot, "site");
  const store = new LocalSiteFSStore(siteRoot);
  await store.init();

  const history = await store.listHistory();
  let startUrl = options.startUrl;
  try {
    const current = await store.readSnapshot("current");
    if (current.url) startUrl = current.url;
  } catch {
    // keep provided startUrl
  }

  const crawlManifest = await readCrawlPageCount(store);
  const run: SiteRunRecord = {
    runId: new Date().toISOString(),
    origin: new URL(startUrl).origin.toLowerCase(),
    sessionRoot,
    siteRoot,
    startedAt: options.startedAt,
    finishedAt: new Date().toISOString(),
    startUrl,
    passed: options.passed,
    pageCount: crawlManifest || 1,
    historyRange: history.length ? [history[0]!, history.at(-1)!] : undefined
  };

  const previousRun = await registerRun(run);
  const runsForOrigin = await listRunsForOrigin(startUrl);
  const manifest = await buildViewerManifest(store, {
    run,
    previousRun,
    runsForOrigin
  } satisfies BuildViewerManifestOptions);

  await mkdir(store.path("meta"), { recursive: true });
  const manifestPath = await writeViewerManifest(store, manifest);
  await writeQaIssuesToPages(store);
  return { manifestPath, run, previousRun };
}

async function writeQaIssuesToPages(store: LocalSiteFSStore): Promise<void> {
  try {
    const raw = await readFile(store.path("reports", "qa-summary.json"), "utf8");
    const report = JSON.parse(raw) as { issues?: Array<{ severity: string; code: string; message: string }> };
    if (!report.issues?.length) return;
    const homeDir = store.path("pages", "home");
    await mkdir(homeDir, { recursive: true });
    await writeFile(join(homeDir, "issues.json"), stringifyJson(report.issues), "utf8");
  } catch {
    // optional
  }
}

async function readCrawlPageCount(store: LocalSiteFSStore): Promise<number> {
  try {
    const raw = await readFile(store.path("crawl", "manifest.json"), "utf8");
    const manifest = JSON.parse(raw) as { pages?: unknown[] };
    return manifest.pages?.length ?? 1;
  } catch {
    try {
      const pages = await readdir(store.path("pages"));
      return pages.length || 1;
    } catch {
      return 1;
    }
  }
}
