import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildStructuralDiff, diffSnapshots } from "./diff.js";
import type { PageSnapshot } from "./types.js";

describe("diffSnapshots", () => {
  it("detects link and button structural changes", () => {
    const before = baseSnapshot();
    const after = baseSnapshot({
      links: [{ text: "About", href: "https://example.test/about", visible: true }],
      buttons: [{ text: "Submit", role: "button", selector: "button.submit", visible: true, enabled: true }]
    });
    const structural = buildStructuralDiff(before, after);
    assert.equal(structural.links.added.length, 1);
    assert.equal(structural.buttons.added.length, 1);
    const markdown = diffSnapshots(before, after);
    assert.match(markdown, /## Links/);
    assert.match(markdown, /About/);
  });
});

function baseSnapshot(overrides: Partial<PageSnapshot> = {}): PageSnapshot {
  return {
    id: "0001",
    url: "https://example.test",
    title: "Example",
    visibleText: "Hello\n",
    summary: "",
    accessibilityTree: {},
    dom: {},
    links: [],
    buttons: [],
    forms: [],
    inputs: [],
    consoleLogs: [],
    networkLogs: [],
    screenshotPath: "screenshot.png",
    timestamp: "",
    ...overrides
  };
}
