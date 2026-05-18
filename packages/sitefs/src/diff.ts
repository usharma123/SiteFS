import type { PageSnapshot } from "./types.js";

export function diffSnapshots(before: PageSnapshot, after: PageSnapshot): string {
  const lines: string[] = [
    "# UI Diff",
    "",
    `Before: ${before.id} ${before.url}`,
    `After: ${after.id} ${after.url}`,
    "",
    "## Text Changes",
    ...textDiff(before.visibleText, after.visibleText),
    "",
    "## Controls",
    ...listDiff("Buttons", before.buttons.map((b) => b.text || b.selector), after.buttons.map((b) => b.text || b.selector)),
    ...listDiff("Inputs", before.inputs.map((i) => i.label || i.name || i.selector), after.inputs.map((i) => i.label || i.name || i.selector)),
    "",
    "## Console",
    ...consoleDiff(before, after),
    "",
    "## Network",
    ...networkDiff(before, after)
  ];
  return `${lines.join("\n")}\n`;
}

function textDiff(before: string, after: string): string[] {
  if (before === after) return ["- No visible text changes."];
  const beforeLines = new Set(splitText(before));
  const afterLines = new Set(splitText(after));
  const added = [...afterLines].filter((line) => !beforeLines.has(line)).slice(0, 12);
  const removed = [...beforeLines].filter((line) => !afterLines.has(line)).slice(0, 12);
  const lines: string[] = [];
  if (added.length) lines.push("Added:", ...added.map((line) => `- ${line}`));
  if (removed.length) lines.push("Removed:", ...removed.map((line) => `- ${line}`));
  return lines.length ? lines : ["- Visible text changed, but only whitespace or duplicate lines differed."];
}

function listDiff(label: string, before: string[], after: string[]): string[] {
  const beforeSet = new Set(before.filter(Boolean));
  const afterSet = new Set(after.filter(Boolean));
  const added = [...afterSet].filter((item) => !beforeSet.has(item));
  const removed = [...beforeSet].filter((item) => !afterSet.has(item));
  const lines = [`### ${label}`];
  if (!added.length && !removed.length) return [...lines, "- No changes."];
  if (added.length) lines.push(...added.map((item) => `- Added: ${item}`));
  if (removed.length) lines.push(...removed.map((item) => `- Removed: ${item}`));
  return lines;
}

function consoleDiff(_before: PageSnapshot, after: PageSnapshot): string[] {
  const errors = after.consoleLogs.filter((entry) => ["error", "warning"].includes(entry.type));
  if (!errors.length) return ["- No console errors or warnings in the after snapshot."];
  return errors.map((entry) => `- ${entry.type.toUpperCase()}: ${entry.text}`);
}

function networkDiff(_before: PageSnapshot, after: PageSnapshot): string[] {
  const failures = after.networkLogs.filter((entry) => entry.failure || (entry.status && entry.status >= 400));
  if (!failures.length) return ["- No failed network requests in the after snapshot."];
  return failures.map((entry) => `- ${entry.method} ${entry.url} ${entry.status ?? entry.failure ?? ""}`.trim());
}

function splitText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

