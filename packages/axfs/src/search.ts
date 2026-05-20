import type { AxEntry, AxFilesystem, FindOptions, GrepOptions } from "./types.js";
import { matchTypeFilter, normalizePath } from "./mapper.js";

export function findEntries(fs: AxFilesystem, cwd: string, opts: FindOptions): AxEntry[] {
  const start = fs.entriesByPath.get(normalizePath(cwd)) ?? fs.root;
  const pattern = opts.pattern?.toLowerCase();
  const roles = opts.type ? matchTypeFilter(opts.type) : undefined;
  const results: AxEntry[] = [];
  const limit = opts.limit ?? 50;

  const walk = (entry: AxEntry) => {
    if (results.length >= limit) return;
    const hay = opts.content
      ? `${entry.segment} ${entry.name} ${entry.value ?? ""} ${entry.description ?? ""}`.toLowerCase()
      : `${entry.segment} ${entry.name} ${entry.role}`.toLowerCase();
    const matchPattern = !pattern || hay.includes(pattern);
    const matchRole = !roles || roles.some((r) => entry.role.toLowerCase().includes(r));
    if (matchPattern && matchRole && entry.path !== "/") results.push(entry);
    for (const child of entry.children) walk(child);
  };

  walk(start);
  return results;
}

export function grepEntries(fs: AxFilesystem, cwd: string, opts: GrepOptions): AxEntry[] {
  const start = fs.entriesByPath.get(normalizePath(cwd)) ?? fs.root;
  const pattern = opts.pattern.toLowerCase();
  const results: AxEntry[] = [];
  const limit = opts.limit ?? 50;

  const walk = (entry: AxEntry) => {
    if (results.length >= limit) return;
    const hay = opts.content
      ? `${entry.name} ${entry.value ?? ""} ${entry.description ?? ""}`.toLowerCase()
      : `${entry.segment} ${entry.name}`.toLowerCase();
    if (entry.path !== "/" && hay.includes(pattern)) results.push(entry);
    if (opts.recursive) for (const child of entry.children) walk(child);
  };

  walk(start);
  if (!opts.recursive) {
    return start.children.filter((c) => {
      const hay = opts.content
        ? `${c.name} ${c.value ?? ""}`.toLowerCase()
        : `${c.segment} ${c.name}`.toLowerCase();
      return hay.includes(pattern);
    });
  }
  return results;
}

export function extractLinks(entry: AxEntry, limit = 100): Array<{ text: string; url: string }> {
  const links: Array<{ text: string; url: string }> = [];
  const walk = (e: AxEntry) => {
    if (links.length >= limit) return;
    if (e.role === "link") {
      links.push({ text: e.name || e.segment, url: e.value ?? e.description ?? "" });
    }
    for (const child of e.children) walk(child);
  };
  walk(entry);
  return links;
}
