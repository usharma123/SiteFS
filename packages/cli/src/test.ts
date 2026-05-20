import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { loadSessionConfig, LocalSiteFSStore } from "@sitefs/sitefs";
import { runAllChecks, buildQAReport } from "@sitefs/qa";
import { WebRuntime } from "./runtime.js";
import { WorkerBrowserBackend } from "@sitefs/browser";
import { finalizeAndOpenViewer } from "./viewer-host.js";

export interface TestOptions {
  url: string;
  sessionRoot: string;
  headed: boolean;
  crawl: boolean;
  fresh: boolean;
  noOpen?: boolean;
}

export async function runTest(options: TestOptions): Promise<number> {
  const sessionRoot = resolve(options.sessionRoot);
  const startedAt = new Date().toISOString();
  if (options.fresh) {
    await rm(sessionRoot, { recursive: true, force: true });
  }
  const siteRoot = resolve(sessionRoot, "site");
  await mkdir(siteRoot, { recursive: true });

  const config = await loadSessionConfig(sessionRoot);
  const store = new LocalSiteFSStore(siteRoot);
  await store.init();

  const backend = new WorkerBrowserBackend({
    headed: options.headed,
    waitUntil: config.waitUntil,
    networkIdleTimeoutMs: config.networkIdleTimeoutMs
  });
  const runtime = new WebRuntime(backend, store, { config, sessionRoot, openViewerOnCheckAll: false });

  try {
    process.stdout.write(`Opening ${options.url}\n`);
    await runtime.handle(["open", options.url]);
    await runtime.handle(["report"]);

    if (options.crawl) {
      process.stdout.write("Crawling same-origin pages...\n");
      await runtime.handle(["crawl"]);
      const crawlReport = await runtime.handle(["report"]);
      await store.writeReport(
        "test-summary.md",
        [
          "# SiteFS Test Summary",
          "",
          `URL: ${options.url}`,
          `Crawl: enabled`,
          "",
          crawlReport
        ].join("\n")
      );
    } else {
      const output = await runtime.handle(["report"]);
      await store.writeReport("test-summary.md", `# SiteFS Test Summary\n\n${output}`);
    }

    const snapshot = await store.readSnapshot("current");
    const issues = await runAllChecks(snapshot, (href) => backend.probeLink(href), {
      linkScope: config.linkScope,
      failOnWarnings: config.failOnWarnings
    });
    const report = buildQAReport(snapshot, await store.listHistory(), issues, undefined, {
      failOnWarnings: config.failOnWarnings
    });

    process.stdout.write(`\nResult: ${report.passed ? "PASSED" : "FAILED"} (${report.summary})\n`);
    process.stdout.write(`Session: ${sessionRoot}/site\n`);

    await finalizeAndOpenViewer({
      sessionRoot,
      startUrl: options.url,
      startedAt,
      passed: report.passed,
      open: !options.noOpen
    });

    return report.passed ? 0 : 1;
  } finally {
    await runtime.close();
  }
}
