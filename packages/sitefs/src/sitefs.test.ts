import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectDangerousAction } from "./guardrails.js";
import { LocalSiteFSStore } from "./store.js";
import type { PageSnapshot } from "./types.js";

describe("SiteFS store", () => {
  it("writes current snapshots and zero-padded history", async () => {
    const root = await mkdtemp(join(tmpdir(), "sitefs-store-"));
    try {
      const store = new LocalSiteFSStore(root);
      await store.init();
      await store.writeCurrent(snapshot("First page"));
      const first = await store.writeHistory(snapshot("First page"));
      const second = await store.writeHistory(snapshot("Second page"));

      assert.equal(first, "0001");
      assert.equal(second, "0002");
      assert.match(await readFile(join(root, "current", "visible_text.txt"), "utf8"), /First page/);
      assert.deepEqual(await store.listHistory(), ["0001", "0002"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("creates action diffs between snapshots", async () => {
    const root = await mkdtemp(join(tmpdir(), "sitefs-diff-"));
    try {
      const store = new LocalSiteFSStore(root);
      await store.init();
      await store.writeHistory(snapshot("Login form visible"));
      await store.writeHistory(snapshot("Invalid email or password"));

      const diff = await store.writeDiff("0001", "0002");
      assert.match(diff, /# UI Diff/);
      assert.match(diff, /Invalid email or password/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("writes named flow reports with journey diffs", async () => {
    const root = await mkdtemp(join(tmpdir(), "sitefs-flow-"));
    try {
      const store = new LocalSiteFSStore(root);
      await store.init();
      const first = await store.writeHistory(snapshot("Login form visible"));
      const second = await store.writeHistory(snapshot("Invalid email or password"));
      await store.startFlow("Login Flow");
      await store.addFlowStep("Open login page", "open", first);
      await store.addFlowStep("Submit invalid credentials", "click Submit", second);
      const flow = await store.getFlow("login-flow");

      assert.ok(flow);
      const report = await store.writeFlowReport(flow);
      assert.match(report, /# Flow: login-flow/);
      assert.match(report, /0001 -> 0002/);
      assert.match(await readFile(join(root, "reports", "journey.md"), "utf8"), /Invalid email or password/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("guardrails", () => {
  it("detects destructive action text", () => {
    assert.ok(detectDangerousAction("Delete account"));
    assert.equal(detectDangerousAction("Login"), null);
  });
});

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
    buttons: [{ text: "Login", role: "button", selector: "button", visible: true, enabled: true }],
    forms: [],
    inputs: [],
    consoleLogs: [],
    networkLogs: [],
    screenshotPath: "screenshot.png",
    timestamp: new Date().toISOString(),
    screenshotBuffer: new Uint8Array([1, 2, 3])
  };
}
