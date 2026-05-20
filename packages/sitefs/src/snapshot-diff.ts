import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import type { ButtonInfo, LinkInfo, PageSnapshot } from "./types.js";

export interface StructuralDiff {
  text: string[];
  links: { added: LinkInfo[]; removed: LinkInfo[]; changed: Array<{ before: LinkInfo; after: LinkInfo }> };
  buttons: { added: ButtonInfo[]; removed: ButtonInfo[]; changed: Array<{ before: ButtonInfo; after: ButtonInfo }> };
}

export function diffSnapshots(before: PageSnapshot, after: PageSnapshot): string {
  const structural = buildStructuralDiff(before, after);
  const lines: string[] = [
    "# UI Diff",
    "",
    `Before: ${before.id} ${before.url}`,
    `After: ${after.id} ${after.url}`,
    "",
    "## Text Changes",
    ...structural.text,
    "",
    "## Links",
    ...renderLinkDiff(structural.links),
    "",
    "## Buttons",
    ...renderButtonDiff(structural.buttons),
    "",
    "## Controls (summary)",
    ...listDiff("Inputs", before.inputs.map((i) => i.label || i.name || i.selector), after.inputs.map((i) => i.label || i.name || i.selector)),
    "",
    "## Screenshots",
    ...screenshotDiff(before, after),
    "",
    "## Console",
    ...consoleDiff(before, after),
    "",
    "## Network",
    ...networkDiff(before, after)
  ];
  return `${lines.join("\n")}\n`;
}

export function diffSnapshotsJson(before: PageSnapshot, after: PageSnapshot): string {
  return `${JSON.stringify(buildStructuralDiff(before, after), null, 2)}\n`;
}

export function buildStructuralDiff(before: PageSnapshot, after: PageSnapshot): StructuralDiff {
  return {
    text: textDiff(before.visibleText, after.visibleText),
    links: diffLinks(before.links, after.links),
    buttons: diffButtons(before.buttons, after.buttons)
  };
}

export interface VisualDiffResult {
  markdown: string;
  changedPixels: number;
  totalPixels: number;
  percentChanged: number;
  diffPng?: Buffer;
}

export async function diffVisualFromPaths(beforeDir: string, afterDir: string): Promise<VisualDiffResult> {
  const beforePath = join(beforeDir, "screenshot.png");
  const afterPath = join(afterDir, "screenshot.png");
  const [beforeBuf, afterBuf] = await Promise.all([readFile(beforePath), readFile(afterPath)]);
  return diffVisualBuffers(beforeBuf, afterBuf, beforePath, afterPath);
}

export function diffVisualBuffers(
  beforeBuf: Buffer,
  afterBuf: Buffer,
  beforeLabel = "before",
  afterLabel = "after",
  beforeSha256?: string,
  afterSha256?: string
): VisualDiffResult {
  const img1 = PNG.sync.read(beforeBuf);
  const img2 = PNG.sync.read(afterBuf);
  const width = Math.max(img1.width, img2.width);
  const height = Math.max(img1.height, img2.height);

  const a = padImage(img1, width, height);
  const b = padImage(img2, width, height);
  const diff = new PNG({ width, height });
  const changedPixels = pixelmatch(a.data, b.data, diff.data, width, height, { threshold: 0.1 });
  const totalPixels = width * height;
  const percentChanged = totalPixels ? (changedPixels / totalPixels) * 100 : 0;

  const markdown = [
    "# Visual Diff",
    "",
    `Before: ${beforeLabel}`,
    `After: ${afterLabel}`,
    "",
    `Changed pixels: ${changedPixels} / ${totalPixels} (${percentChanged.toFixed(2)}%)`,
    beforeSha256 && afterSha256 ? `SHA256 before: ${beforeSha256}\nSHA256 after: ${afterSha256}` : "",
    changedPixels === 0 ? "- No visual changes detected." : "- Visual changes detected."
  ]
    .filter(Boolean)
    .join("\n");

  return {
    markdown: `${markdown}\n`,
    changedPixels,
    totalPixels,
    percentChanged,
    diffPng: changedPixels > 0 ? PNG.sync.write(diff) : undefined
  };
}

function screenshotDiff(before: PageSnapshot, after: PageSnapshot): string[] {
  if (!before.screenshotSha256 && !after.screenshotSha256) return ["- No screenshot hashes recorded."];
  if (before.screenshotSha256 === after.screenshotSha256) return ["- Screenshot SHA256 unchanged."];
  return [
    `- Before SHA256: ${before.screenshotSha256 ?? "n/a"}`,
    `- After SHA256: ${after.screenshotSha256 ?? "n/a"}`
  ];
}

function padImage(img: PNG, width: number, height: number): PNG {
  if (img.width === width && img.height === height) return img;
  const out = new PNG({ width, height });
  PNG.bitblt(img, out, 0, 0, img.width, img.height, 0, 0);
  return out;
}

function linkKey(link: LinkInfo): string {
  return `${link.text}::${link.href}`;
}

function diffLinks(before: LinkInfo[], after: LinkInfo[]): StructuralDiff["links"] {
  const beforeMap = new Map(before.map((l) => [linkKey(l), l]));
  const afterMap = new Map(after.map((l) => [linkKey(l), l]));
  const added = after.filter((l) => !beforeMap.has(linkKey(l)));
  const removed = before.filter((l) => !afterMap.has(linkKey(l)));
  const changed: Array<{ before: LinkInfo; after: LinkInfo }> = [];
  for (const [key, afterLink] of afterMap) {
    const beforeLink = beforeMap.get(key);
    if (beforeLink && (beforeLink.visible !== afterLink.visible || beforeLink.href !== afterLink.href)) {
      changed.push({ before: beforeLink, after: afterLink });
    }
  }
  return { added, removed, changed };
}

function diffButtons(before: ButtonInfo[], after: ButtonInfo[]): StructuralDiff["buttons"] {
  const key = (b: ButtonInfo) => b.selector || b.text;
  const beforeMap = new Map(before.map((b) => [key(b), b]));
  const afterMap = new Map(after.map((b) => [key(b), b]));
  const added = after.filter((b) => !beforeMap.has(key(b)));
  const removed = before.filter((b) => !afterMap.has(key(b)));
  const changed: Array<{ before: ButtonInfo; after: ButtonInfo }> = [];
  for (const [k, afterBtn] of afterMap) {
    const beforeBtn = beforeMap.get(k);
    if (beforeBtn && (beforeBtn.text !== afterBtn.text || beforeBtn.enabled !== afterBtn.enabled)) {
      changed.push({ before: beforeBtn, after: afterBtn });
    }
  }
  return { added, removed, changed };
}

function renderLinkDiff(links: StructuralDiff["links"]): string[] {
  const lines: string[] = [];
  if (!links.added.length && !links.removed.length && !links.changed.length) {
    return ["- No link changes."];
  }
  if (links.added.length) lines.push(...links.added.map((l) => `- Added: ${l.text || l.href} (${l.href})`));
  if (links.removed.length) lines.push(...links.removed.map((l) => `- Removed: ${l.text || l.href} (${l.href})`));
  if (links.changed.length) {
    lines.push(...links.changed.map((c) => `- Changed: ${c.before.href} -> ${c.after.href}`));
  }
  return lines;
}

function renderButtonDiff(buttons: StructuralDiff["buttons"]): string[] {
  const lines: string[] = [];
  if (!buttons.added.length && !buttons.removed.length && !buttons.changed.length) {
    return ["- No button changes."];
  }
  if (buttons.added.length) lines.push(...buttons.added.map((b) => `- Added: ${b.text || b.selector}`));
  if (buttons.removed.length) lines.push(...buttons.removed.map((b) => `- Removed: ${b.text || b.selector}`));
  if (buttons.changed.length) {
    lines.push(...buttons.changed.map((c) => `- Changed: ${c.before.text} -> ${c.after.text}`));
  }
  return lines;
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
