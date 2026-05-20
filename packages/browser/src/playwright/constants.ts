import type { ConsoleMessage } from "playwright";
import { extractorScript } from "../extractors.js";

export const blockedStatuses = new Set([403, 999]);
export const blockedHostPatterns = [/linkedin\.com/i, /twitter\.com/i, /x\.com/i];
export const browserUserAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
export const windowLikeHeight = 700;

export function isBlockedLink(href: string, status?: number): boolean {
  if (status !== undefined && blockedStatuses.has(status)) return true;
  try {
    const host = new URL(href).hostname;
    return blockedHostPatterns.some((pattern) => pattern.test(host));
  } catch {
    return false;
  }
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function formatConsoleLocation(message: ConsoleMessage): string | undefined {
  const location = message.location();
  return location.url ? `${location.url}:${location.lineNumber}:${location.columnNumber}` : undefined;
}

export function buildSummary(url: string, title: string, extracted: ReturnType<typeof extractorScript>): string {
  const visibleControls = [
    ...extracted.inputs.map((input) => `${input.label || input.name || input.type} input`),
    ...extracted.buttons.map((button) => `${button.text || button.selector} button`),
    ...extracted.links.slice(0, 12).map((link) => `${link.text || link.href} link`)
  ];
  const warnings = [
    extracted.a11yIssues.length ? `${extracted.a11yIssues.length} accessibility issue(s)` : "No accessibility issues from MVP checks"
  ];
  return [
    "# Current Page",
    "",
    `URL: ${url}`,
    `Title: ${title}`,
    "",
    "Visible controls:",
    ...(visibleControls.length ? visibleControls.map((item) => `- ${item}`) : ["- None detected"]),
    "",
    "Detected forms:",
    ...(extracted.forms.length ? extracted.forms.map((form) => `- ${form.name}`) : ["- None detected"]),
    "",
    "Warnings:",
    ...warnings.map((warning) => `- ${warning}`)
  ].join("\n") + "\n";
}
