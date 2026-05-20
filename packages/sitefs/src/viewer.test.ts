import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LocalSiteFSStore } from "./store.js";
import { loadRegistryIndex, registerRun, getPreviousRun } from "./registry.js";
import { normalizePageUrl } from "./url.js";

describe("run registry", () => {
  it("registers runs per origin and returns previous run", async () => {
    const registryDir = await mkdtemp(join(tmpdir(), "sitefs-registry-"));
    try {
      const first = {
        runId: "run-1",
        origin: "https://example.com",
        sessionRoot: "/tmp/a",
        siteRoot: "/tmp/a/site",
        startedAt: "2026-01-01T00:00:00.000Z",
        finishedAt: "2026-01-01T00:01:00.000Z",
        startUrl: "https://example.com/",
        passed: true,
        pageCount: 1
      };
      const second = { ...first, runId: "run-2", sessionRoot: "/tmp/b", siteRoot: "/tmp/b/site" };

      const previous = await registerRun(first, registryDir);
      assert.equal(previous, undefined);

      await registerRun(second, registryDir);
      const prev = await getPreviousRun("https://example.com/home", registryDir);
      assert.equal(prev?.runId, "run-1");

      const index = await loadRegistryIndex(registryDir);
      assert.equal(index.origins["https://example.com"]?.length, 2);
    } finally {
      await rm(registryDir, { recursive: true, force: true });
    }
  });

  it("normalizes page urls without trailing slash", () => {
    assert.equal(normalizePageUrl("https://example.com/about/"), "https://example.com/about");
  });
});

describe("viewer manifest", () => {
  it("builds a tree for a single-page session", async () => {
    const root = await mkdtemp(join(tmpdir(), "sitefs-viewer-"));
    try {
      const store = new LocalSiteFSStore(root);
      await store.init();
      await store.writeCurrent({
        id: "current",
        url: "https://example.com/",
        title: "Example",
        visibleText: "Hello world",
        summary: "Home page",
        accessibilityTree: null,
        dom: null,
        links: [],
        buttons: [],
        forms: [],
        inputs: [],
        consoleLogs: [],
        networkLogs: [],
        screenshotPath: "screenshot.png",
        timestamp: "2026-01-01T00:00:00.000Z"
      });
      await store.copyCurrentToPage("home");
      await mkdir(join(root, "reports"), { recursive: true });
      await writeFile(join(root, "reports", "qa-summary.json"), "{}\n", "utf8");

      const { buildViewerManifest, writeViewerManifest } = await import("./viewer-manifest.js");
      const run = {
        runId: "run-1",
        origin: "https://example.com",
        sessionRoot: root,
        siteRoot: root,
        startedAt: "2026-01-01T00:00:00.000Z",
        finishedAt: "2026-01-01T00:01:00.000Z",
        startUrl: "https://example.com/",
        passed: true,
        pageCount: 1
      };
      const manifest = await buildViewerManifest(store, { run });
      assert.ok(manifest.treePaths.some((path) => path.startsWith("pages/home/")));
      assert.equal(manifest.pages[0]?.slug, "home");

      const manifestPath = await writeViewerManifest(store, manifest);
      const saved = JSON.parse(await readFile(manifestPath, "utf8"));
      assert.equal(saved.run.runId, "run-1");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
