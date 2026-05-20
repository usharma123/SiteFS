import type { AxEntry } from "@sitefs/axfs";
import type { FindOptions, ListOptions } from "@sitefs/axfs";

export function parseLsOptions(args: string[]): ListOptions & { paths: string[] } {
  const opts: ListOptions & { paths: string[] } = { paths: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "-l") opts.long = true;
    else if (a === "--meta") opts.meta = true;
    else if (a === "--text") opts.text = true;
    else if (a === "-r") opts.recursive = true;
    else if (a === "--count") opts.count = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--after") opts.after = args[++i];
    else if (a === "--before") opts.before = args[++i];
    else if (a === "--textlen") opts.textlen = Number(args[++i]) || 40;
    else if (a.startsWith("--type=")) opts.type = a.split("=")[1];
    else if (a === "--type") opts.type = args[++i];
    else if (!a.startsWith("-")) opts.paths.push(a);
  }
  if (opts.text && opts.textlen === undefined) opts.textlen = 40;
  return opts;
}

export function formatEntry(e: { path: string; segment: string; role: string; name: string; value?: string; isDirectory: boolean }) {
  return { path: e.path, segment: e.segment, role: e.role, name: e.name, value: e.value, directory: e.isDirectory };
}

export function formatLsLine(e: AxEntry, opts: ListOptions): string {
  const prefix = e.isDirectory ? "[d]" : `[${e.role.slice(0, 1)}]`;
  let line = opts.long ? `${prefix} ${e.role.padEnd(12)} ${e.segment}` : e.segment;
  if (opts.meta && (e.value || e.description)) {
    line += `  [${e.role}] ${(e.value ?? e.description ?? "").slice(0, 80)}`;
  }
  if (opts.text) {
    const preview = (e.name || e.value || "").slice(0, opts.textlen ?? 40);
    if (preview) line += `  "${preview}"`;
  }
  return line;
}

export function formatFindLine(e: AxEntry, opts: FindOptions): string {
  let line = `${e.path}\t[${e.role}]\t${e.segment}`;
  if (opts.meta && (e.value || e.description)) {
    line += `\t${(e.value ?? e.description ?? "").slice(0, 80)}`;
  }
  if (opts.text) {
    const preview = (e.name || e.value || "").slice(0, 40);
    if (preview) line += `\t"${preview}"`;
  }
  return line;
}

export function renderTree(entry: AxEntry, maxDepth: number, depth: number): string {
  if (depth > maxDepth) return "";
  const indent = "  ".repeat(depth);
  const lines = [`${indent}${entry.segment || "/"}`];
  for (const child of entry.children) {
    lines.push(renderTree(child, maxDepth, depth + 1));
  }
  return lines.filter(Boolean).join("\n");
}

export function parseArgs(line: string): string[] {
  const parts: string[] = [];
  let cur = "";
  let quote: string | null = null;
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (/\s/.test(ch)) {
      if (cur) {
        parts.push(cur);
        cur = "";
      }
    } else cur += ch;
  }
  if (cur) parts.push(cur);
  return parts;
}

export function flagValue(args: string[], flag: string, fallback: number): number | undefined {
  const i = args.indexOf(flag);
  if (i < 0) return fallback;
  return Number(args[i + 1]) || fallback;
}

export function required<T>(value: T | undefined, message: string): T {
  if (value === undefined || value === "") throw new Error(message);
  return value;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function helpText(): string {
  return [
    "SiteFS shell — live AX commands + web QA",
    "",
    "Browser: tabs, windows, here, navigate, goto, open, back, forward, close",
    "DOM: ls, cd, pwd, tree, cat, text, read, grep, find, extract_links, click, focus, type, submit, scroll, select, wait, js, eval, screenshot, diff, refresh",
    "Automation: watch, for, each, script, functions, call",
    "System: whoami, env, export, history, bookmark, debug, help, clear",
    "QA: web help (open, check-all, report, crawl, diff-visual, flow, ...)",
    ""
  ].join("\n");
}
