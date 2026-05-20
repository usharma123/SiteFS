import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";
import { defaultSessionConfig, LocalSiteFSStore, type PageSnapshot } from "@sitefs/sitefs";
import { WebRuntime } from "./runtime.js";

describe("WebRuntime", () => {
  it("supports web diff latest", async () => {
    const root = await mkdtemp(join(tmpdir(), "sitefs-runtime-"));
    try {
      const store = new LocalSiteFSStore(root);
      await store.init();
      await store.writeHistory(snapshot("Before"));
      await store.writeHistory(snapshot("After"));
      const runtime = new WebRuntime(fakeBackend(), store, { config: defaultSessionConfig });

      const output = await runtime.handle(["diff", "latest"]);
      assert.match(output, /# UI Diff/);
      assert.match(output, /After/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("web report includes probeLink warnings", async () => {
    const root = await mkdtemp(join(tmpdir(), "sitefs-report-"));
    try {
      const store = new LocalSiteFSStore(root);
      await store.init();
      await store.writeCurrent(snapshot("Page"));
      const runtime = new WebRuntime(fakeBackend(), store, { config: defaultSessionConfig });
      const output = await runtime.handle(["report"]);
      assert.match(output, /qa-summary/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("prints a useful missing snapshot message", async () => {
    const root = await mkdtemp(join(tmpdir(), "sitefs-runtime-empty-"));
    try {
      const store = new LocalSiteFSStore(root);
      await store.init();
      const runtime = new WebRuntime(fakeBackend(), store, { config: defaultSessionConfig });

      const output = await runtime.handle(["current"]);
      assert.match(output, /No current snapshot exists yet/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

function fakeBackend() {
  return {
    open: async () => {},
    click: async () => {},
    type: async () => {},
    scroll: async () => {},
    wait: async () => {},
    back: async () => {},
    forward: async () => {},
    snapshot: async () => snapshot("Current"),
    probeLink: async () => ({ ok: true, status: 200 }),
    close: async () => {}
  };
}

function snapshot(text: string): PageSnapshot {
  return {
    id: "current",
    url: "https://example.test",
    title: "Example",
    visibleText: `${text}\n`,
    summary: "# Current Page\n",
    accessibilityTree: { tree: null, issues: [] },
    dom: { tag: "html" },
    links: [],
    buttons: [],
    forms: [],
    inputs: [],
    consoleLogs: [],
    networkLogs: [],
    screenshotPath: "screenshot.png",
    timestamp: new Date().toISOString()
  };
}
