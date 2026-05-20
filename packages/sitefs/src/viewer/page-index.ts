import { createHash } from "node:crypto";
import { access, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stringifyJson } from "../format.js";
import { readJsonFileOptional, readSnapshotFromDir, readTextFile } from "../snapshot-io.js";
import { normalizePageUrl, pageSlugFromUrl } from "../url.js";
import type { CrawlManifest, Issue } from "../types.js";
import type { LocalSiteFSStore } from "../store.js";
import type { PageChangeStatus, PageDiffEntry, PageSnapshotDir } from "./types.js";
import { buildStructuralDiff, diffVisualFromPaths } from "../snapshot-diff.js";

export async function ensureHomePage(store: LocalSiteFSStore): Promise<void> {
  const pagesDir = store.path("pages");
  try {
    const entries = await readdir(pagesDir, { withFileTypes: true });
    if (entries.some((entry) => entry.isDirectory())) return;
  } catch {
    // pages dir missing
  }
  try {
    await store.copyCurrentToPage("home");
    const snapshot = await store.readSnapshot("current");
    await writePageIssues(store.path("pages", "home"), snapshot.axeViolations?.length ?? 0, []);
  } catch {
    // no current snapshot yet
  }
}

export async function collectPages(siteRoot: string): Promise<Map<string, PageSnapshotDir>> {
  const result = new Map<string, PageSnapshotDir>();
  const manifest = await readCrawlManifest(siteRoot);

  if (manifest?.pages.length) {
    for (const entry of manifest.pages) {
      const dir = join("pages", entry.slug);
      const page = await readPageDir(siteRoot, dir, entry.url, entry.slug, entry.title);
      if (page) result.set(normalizePageUrl(page.url), page);
    }
    return result;
  }

  const pagesRoot = join(siteRoot, "pages");
  try {
    const entries = await readdir(pagesRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = join("pages", entry.name);
      const page = await readPageDir(siteRoot, dir);
      if (page) result.set(normalizePageUrl(page.url), page);
    }
  } catch {
    // no pages
  }

  if (!result.size) {
    const currentDir = join(siteRoot, "current");
    if (await pathExistsLocal(currentDir)) {
      const page = await readPageDir(siteRoot, "current");
      if (page) {
        const slug = "home";
        result.set(normalizePageUrl(page.url), { ...page, slug, dir: join("pages", slug) });
      }
    }
  }

  return result;
}

export function classifyPageChange(current?: PageSnapshotDir, previous?: PageSnapshotDir): PageChangeStatus {
  if (current && !previous) return "added";
  if (!current && previous) return "removed";
  if (!current || !previous) return "unchanged";
  if (current.textHash !== previous.textHash) return "changed";
  if (current.screenshotHash && previous.screenshotHash && current.screenshotHash !== previous.screenshotHash) {
    return "changed";
  }
  if (current.issueCount !== previous.issueCount) return "changed";
  return "unchanged";
}

export async function buildPageDiff(
  url: string,
  slug: string,
  status: PageChangeStatus,
  current: PageSnapshotDir | undefined,
  previous: PageSnapshotDir | undefined,
  currentSiteRoot: string,
  previousSiteRoot?: string
): Promise<PageDiffEntry | null> {
  const entry: PageDiffEntry = { url, slug, status };
  if (current) {
    const dir = join(currentSiteRoot, current.dir);
    entry.afterPath = current.dir;
    entry.afterText = await readTextFile(join(dir, "visible_text.txt")).catch(() => "");
    entry.afterSummary = await readTextFile(join(dir, "summary.md")).catch(() => "");
    entry.afterLinks = await readTextFile(join(dir, "links.json")).catch(() => "");
  }
  if (previous && previousSiteRoot) {
    const dir = join(previousSiteRoot, previous.dir);
    entry.beforePath = previous.dir;
    entry.beforeText = await readTextFile(join(dir, "visible_text.txt")).catch(() => "");
    entry.beforeSummary = await readTextFile(join(dir, "summary.md")).catch(() => "");
    entry.beforeLinks = await readTextFile(join(dir, "links.json")).catch(() => "");
  }

  if (status === "changed" && current && previous && previousSiteRoot) {
    try {
      const beforeDir = join(previousSiteRoot, previous.dir);
      const afterDir = join(currentSiteRoot, current.dir);
      const visual = await diffVisualFromPaths(beforeDir, afterDir);
      if (visual.diffPng) {
        const visualPath = join("reports", `diff-visual-run-${slug}.png`);
        const { writeFile } = await import("node:fs/promises");
        await writeFile(join(currentSiteRoot, visualPath), visual.diffPng);
        entry.visualDiffPath = visualPath;
      }
      const [beforeSnap, afterSnap] = await Promise.all([
        readSnapshotFromDir(beforeDir),
        readSnapshotFromDir(afterDir)
      ]);
      if (beforeSnap && afterSnap) {
        entry.structuralDiff = buildStructuralDiff(beforeSnap, afterSnap);
      }
    } catch {
      // visual diff optional
    }
  }

  return entry;
}

export async function collectReports(siteRoot: string): Promise<Array<{ name: string; path: string }>> {
  const reportsDir = join(siteRoot, "reports");
  try {
    const entries = await readdir(reportsDir);
    return entries
      .filter((name) => !name.startsWith("."))
      .sort()
      .map((name) => ({ name, path: join("reports", name) }));
  } catch {
    return [];
  }
}

export async function writePageIssues(pageDir: string, _count: number, issues: Issue[]): Promise<void> {
  await writeFile(join(pageDir, "issues.json"), stringifyJson(issues), "utf8");
}

async function readPageDir(
  siteRoot: string,
  relativeDir: string,
  fallbackUrl?: string,
  fallbackSlug?: string,
  fallbackTitle?: string
): Promise<PageSnapshotDir | null> {
  const absDir = join(siteRoot, relativeDir);
  if (!(await pathExistsLocal(absDir))) return null;

  const [url, title, text, screenshotHash, issues] = await Promise.all([
    readTextFile(join(absDir, "url.txt")).catch(() => fallbackUrl ?? ""),
    readTextFile(join(absDir, "title.txt")).catch(() => fallbackTitle ?? ""),
    readTextFile(join(absDir, "visible_text.txt")).catch(() => ""),
    readTextFile(join(absDir, "screenshot.sha256")).catch(() => ""),
    readJsonFileOptional<Issue[]>(join(absDir, "issues.json"))
  ]);

  const slug = fallbackSlug ?? relativeDir.replace(/^pages\//, "");
  return {
    url: url.trim() || fallbackUrl || "",
    slug,
    dir: relativeDir.startsWith("pages/") ? relativeDir : join("pages", slug),
    title: title.trim() || fallbackTitle || slug,
    textHash: hashText(text),
    screenshotHash: screenshotHash.trim(),
    issueCount: issues?.length ?? 0
  };
}

async function readCrawlManifest(siteRoot: string): Promise<CrawlManifest | null> {
  return readJsonFileOptional<CrawlManifest>(join(siteRoot, "crawl", "manifest.json"));
}

async function pathExistsLocal(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export async function countIssues(pageDir: string): Promise<number> {
  const issues = await readJsonFileOptional<Issue[]>(join(pageDir, "issues.json"));
  return issues?.length ?? 0;
}
