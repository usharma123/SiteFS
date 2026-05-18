import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkButtons, checkConsoleErrors, checkForms } from "./checks.js";
import { buildQAReport, renderMarkdownReport } from "./report.js";
import type { PageSnapshot } from "@sitefs/sitefs";

describe("QA checks", () => {
  it("reports console, form, and button issues", () => {
    const snapshot = pageSnapshot();
    assert.equal(checkConsoleErrors(snapshot).length, 1);
    assert.ok(checkForms(snapshot).map((issue) => issue.code).includes("input-missing-label"));
    assert.ok(checkButtons(snapshot).map((issue) => issue.code).includes("button-missing-text"));
  });

  it("renders markdown summaries", () => {
    const snapshot = pageSnapshot();
    const report = buildQAReport(snapshot, ["0001"]);
    const markdown = renderMarkdownReport(report, snapshot);
    assert.match(markdown, /# SiteFS QA Summary/);
    assert.match(markdown, /console-error/);
  });
});

function pageSnapshot(): PageSnapshot {
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
    timestamp: new Date().toISOString()
  };
}
