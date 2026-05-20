import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkButtons, checkConsoleErrors, checkForms, checkBrokenLinks } from "./checks.js";
import { buildQAReport, renderMarkdownReport, renderJsonReport } from "./report.js";
import { runAllChecks } from "./run-all.js";
import type { LinkProbeResult, PageSnapshot } from "@sitefs/sitefs";

describe("QA checks", () => {
  it("reports console, form, and button issues", () => {
    const snapshot = pageSnapshot();
    assert.equal(checkConsoleErrors(snapshot).length, 1);
    assert.ok(checkForms(snapshot).map((issue) => issue.code).includes("input-missing-label"));
    assert.ok(checkButtons(snapshot).map((issue) => issue.code).includes("button-missing-text"));
  });

  it("renders markdown summaries", () => {
    const snapshot = pageSnapshot();
    const report = buildQAReport(snapshot, ["0001"], [
      { severity: "error", code: "console-error", message: "Boom" }
    ]);
    const markdown = renderMarkdownReport(report, snapshot);
    assert.match(markdown, /# SiteFS QA Summary/);
    assert.match(markdown, /console-error/);
  });

  it("fails when failOnWarnings is true", () => {
    const snapshot = pageSnapshot();
    const report = buildQAReport(snapshot, [], [{ severity: "warning", code: "test", message: "warn" }], undefined, {
      failOnWarnings: true
    });
    assert.equal(report.passed, false);
  });

  it("classifies blocked links via probeLink", async () => {
    const snapshot = pageSnapshot({
      links: [{ text: "LinkedIn", href: "https://www.linkedin.com/in/test/", visible: true }]
    });
    const probe = async (): Promise<LinkProbeResult> => ({ ok: false, status: 999, blocked: true });
    const issues = await checkBrokenLinks(snapshot, probe, "all");
    assert.ok(issues.some((i) => i.code === "link-blocked"));
  });

  it("runAllChecks merges static and link issues", async () => {
    const snapshot = pageSnapshot();
    const issues = await runAllChecks(snapshot, async () => ({ ok: true, status: 200 }), {
      linkScope: "same-origin",
      failOnWarnings: false
    });
    assert.ok(issues.some((i) => i.code === "console-error"));
  });

  it("renders JSON report", () => {
    const snapshot = pageSnapshot();
    const report = buildQAReport(snapshot, ["0001"]);
    const json = renderJsonReport(report, snapshot);
    const parsed = JSON.parse(json) as { passed: boolean; title: string };
    assert.equal(parsed.title, "Example");
    assert.equal(typeof parsed.passed, "boolean");
  });
});

function pageSnapshot(overrides: Partial<PageSnapshot> = {}): PageSnapshot {
  return {
    id: "current",
    url: "https://example.test",
    title: "Example",
    visibleText: "Example\n",
    summary: "# Current Page\n",
    accessibilityTree: { issues: [] },
    dom: {},
    links: [],
    buttons: [{ text: "", role: "button", selector: "button", visible: true, enabled: true }],
    forms: [{ name: "login", selector: "form", fields: [], submit: undefined }],
    inputs: [{ label: "", name: "email", type: "email", required: true, selector: "input", visible: true, enabled: true }],
    consoleLogs: [{ type: "error", text: "Boom", timestamp: new Date().toISOString() }],
    networkLogs: [],
    screenshotPath: "screenshot.png",
    timestamp: new Date().toISOString(),
    ...overrides
  };
}
