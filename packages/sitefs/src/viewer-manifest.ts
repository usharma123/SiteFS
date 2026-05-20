import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildStructuralDiff, diffVisualFromPaths } from "./diff.js";
import { stringifyJson } from "./format.js";
import { normalizeOrigin, normalizePageUrl, type SiteRunRecord } from "./registry.js";
import type { LocalSiteFSStore } from "./store.js";
import type { CrawlManifest, Issue, LinkInfo, ButtonInfo, InputInfo, PageSnapshot } from "./types.js";

export type PageChangeStatus = "unchanged" | "added" | "removed" | "changed";

export interface ViewerTreeNode {
  path: string;
  name: string;
  kind: "file" | "directory";
  assetPath?: string;
  pageUrl?: string;
  changeStatus?: PageChangeStatus;
}

export interface PageIndexEntry {
  url: string;
  slug: string;
  dir: string;
  title: string;
  status: PageChangeStatus;
  issueCount: number;
}

export interface ReportEntry {
  name: string;
  path: string;
}

export interface PageDiffEntry {
  url: string;
  slug: string;
  status: PageChangeStatus;
  beforePath?: string;
  afterPath?: string;
  beforeText?: string;
  afterText?: string;
  beforeSummary?: string;
  afterSummary?: string;
  beforeLinks?: string;
  afterLinks?: string;
  visualDiffPath?: string;
  structuralDiff?: ReturnType<typeof buildStructuralDiff>;
}

export interface ViewerManifest {
  run: SiteRunRecord;
  previousRun?: SiteRunRecord;
  originLabel: string;
  treePaths: string[];
  treeNodes: ViewerTreeNode[];
  gitStatus: Record<string, "added" | "modified" | "deleted">;
  pages: PageIndexEntry[];
  reports: ReportEntry[];
  diffs: PageDiffEntry[];
  runsForOrigin: SiteRunRecord[];
}

export interface BuildViewerManifestOptions {
  run: SiteRunRecord;
  previousRun?: SiteRunRecord;
  runsForOrigin?: SiteRunRecord[];
}

const PAGE_ARTIFACTS = [
  "visible_text.txt",
  "summary.md",
  "links.json",
  "buttons.json",
  "forms.json",
  "inputs.json",
  "screenshot.png",
  "screenshot.sha256",
  "a11y-axe.json",
  "console.log",
  "network.json",
  "snapshot.json",
  "issues.json"
] as const;

export async function buildViewerManifest(
  store: LocalSiteFSStore,
  options: BuildViewerManifestOptions
): Promise<ViewerManifest> {
  const siteRoot = store.root;
  await ensureHomePage(store);

  const currentPages = await collectPages(siteRoot);
  const previousPages = options.previousRun ? await collectPages(options.previousRun.siteRoot) : new Map<string, PageSnapshotDir>();

  const pages: PageIndexEntry[] = [];
  const diffs: PageDiffEntry[] = [];
  const gitStatus: Record<string, "added" | "modified" | "deleted"> = {};

  const allUrls = new Set([...currentPages.keys(), ...previousPages.keys()]);
  for (const url of [...allUrls].sort()) {
    const current = currentPages.get(url);
    const previous = previousPages.get(url);
    const status = classifyPageChange(current, previous);
    const slug = current?.slug ?? previous?.slug ?? pageSlugFromUrl(url);
    const dir = current?.dir ?? previous?.dir ?? join("pages", slug);

    if (status !== "unchanged") {
      gitStatus[`pages/${slug}`] = status === "added" ? "added" : status === "removed" ? "deleted" : "modified";
    }

    const issueCount = current ? await countIssues(current.dir) : 0;
    pages.push({
      url,
      slug,
      dir,
      title: current?.title ?? previous?.title ?? slug,
      status,
      issueCount
    });

    if (status === "changed" || status === "added" || status === "removed") {
      const diffEntry = await buildPageDiff(url, slug, status, current, previous, siteRoot, options.previousRun?.siteRoot);
      if (diffEntry) diffs.push(diffEntry);
    }
  }

  const treePaths = buildTreePaths(siteRoot, pages);
  const treeNodes = treePaths.map((path) => nodeFromPath(path, pages));
  const reports = await collectReports(siteRoot);

  return {
    run: options.run,
    previousRun: options.previousRun,
    originLabel: originLabelFromUrl(options.run.startUrl),
    treePaths,
    treeNodes,
    gitStatus,
    pages,
    reports,
    diffs,
    runsForOrigin: options.runsForOrigin ?? (options.previousRun ? [options.run, options.previousRun] : [options.run])
  };
}

export async function writeViewerManifest(store: LocalSiteFSStore, manifest: ViewerManifest): Promise<string> {
  const manifestPath = store.path("viewer-manifest.json");
  await mkdir(store.path("meta"), { recursive: true });
  await writeFile(manifestPath, stringifyJson(manifest), "utf8");
  await writeFile(store.path("meta", "run.json"), stringifyJson(manifest.run), "utf8");
  if (manifest.previousRun) {
    await writeFile(store.path("meta", "previous-run.json"), stringifyJson(manifest.previousRun), "utf8");
  }
  return manifestPath;
}

interface PageSnapshotDir {
  url: string;
  slug: string;
  dir: string;
  title: string;
  textHash: string;
  screenshotHash: string;
  issueCount: number;
}

async function ensureHomePage(store: LocalSiteFSStore): Promise<void> {
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

async function collectPages(siteRoot: string): Promise<Map<string, PageSnapshotDir>> {
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
    if (await pathExists(currentDir)) {
      const page = await readPageDir(siteRoot, "current");
      if (page) {
        const slug = "home";
        result.set(normalizePageUrl(page.url), { ...page, slug, dir: join("pages", slug) });
      }
    }
  }

  return result;
}

async function readPageDir(
  siteRoot: string,
  relativeDir: string,
  fallbackUrl?: string,
  fallbackSlug?: string,
  fallbackTitle?: string
): Promise<PageSnapshotDir | null> {
  const absDir = join(siteRoot, relativeDir);
  if (!(await pathExists(absDir))) return null;

  const [url, title, text, screenshotHash, issues] = await Promise.all([
    readText(join(absDir, "url.txt")).catch(() => fallbackUrl ?? ""),
    readText(join(absDir, "title.txt")).catch(() => fallbackTitle ?? ""),
    readText(join(absDir, "visible_text.txt")).catch(() => ""),
    readText(join(absDir, "screenshot.sha256")).catch(() => ""),
    readJsonOptional<Issue[]>(join(absDir, "issues.json"))
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

function classifyPageChange(current?: PageSnapshotDir, previous?: PageSnapshotDir): PageChangeStatus {
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

async function buildPageDiff(
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
    entry.afterText = await readText(join(dir, "visible_text.txt")).catch(() => "");
    entry.afterSummary = await readText(join(dir, "summary.md")).catch(() => "");
    entry.afterLinks = await readText(join(dir, "links.json")).catch(() => "");
  }
  if (previous && previousSiteRoot) {
    const dir = join(previousSiteRoot, previous.dir);
    entry.beforePath = previous.dir;
    entry.beforeText = await readText(join(dir, "visible_text.txt")).catch(() => "");
    entry.beforeSummary = await readText(join(dir, "summary.md")).catch(() => "");
    entry.beforeLinks = await readText(join(dir, "links.json")).catch(() => "");
  }

  if (status === "changed" && current && previous && previousSiteRoot) {
    try {
      const beforeDir = join(previousSiteRoot, previous.dir);
      const afterDir = join(currentSiteRoot, current.dir);
      const visual = await diffVisualFromPaths(beforeDir, afterDir);
      if (visual.diffPng) {
        const visualPath = join("reports", `diff-visual-run-${slug}.png`);
        await writeFile(join(currentSiteRoot, visualPath), visual.diffPng);
        entry.visualDiffPath = visualPath;
      }
      const [beforeSnap, afterSnap] = await Promise.all([
        readSnapshotLike(beforeDir),
        readSnapshotLike(afterDir)
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

async function readSnapshotLike(dir: string): Promise<PageSnapshot | null> {
  try {
    const [visibleText, links, buttons, inputs, screenshotSha256, url, id] = await Promise.all([
      readText(join(dir, "visible_text.txt")),
      readJson<LinkInfo[]>(join(dir, "links.json")),
      readJson<ButtonInfo[]>(join(dir, "buttons.json")),
      readJson<InputInfo[]>(join(dir, "inputs.json")),
      readText(join(dir, "screenshot.sha256")).catch(() => ""),
      readText(join(dir, "url.txt")),
      readText(join(dir, "title.txt"))
    ]);
    return {
      id: "snapshot",
      url: url.trim(),
      title: id.trim(),
      visibleText,
      summary: "",
      accessibilityTree: null,
      dom: null,
      links,
      buttons,
      inputs,
      forms: [],
      consoleLogs: [],
      networkLogs: [],
      screenshotPath: join(dir, "screenshot.png"),
      timestamp: "",
      screenshotSha256: screenshotSha256.trim() || undefined
    };
  } catch {
    return null;
  }
}

function buildTreePaths(siteRoot: string, pages: PageIndexEntry[]): string[] {
  const paths = new Set<string>();

  for (const page of pages) {
    paths.add(`${page.dir}/`);
    for (const artifact of PAGE_ARTIFACTS) {
      paths.add(`${page.dir}/${artifact}`);
    }
  }

  for (const report of ["qa-summary.md", "qa-summary.json", "check-all.md", "test-summary.md"]) {
    paths.add(`reports/${report}`);
  }

  paths.add("reports/");
  paths.add("crawl/manifest.json");
  paths.add("crawl/");
  paths.add("meta/run.json");
  paths.add("meta/previous-run.json");
  paths.add("meta/");
  paths.add("history/");
  paths.add("flows/");
  paths.add("pages/");

  return [...paths].sort();
}

function nodeFromPath(path: string, pages: PageIndexEntry[]): ViewerTreeNode {
  const normalized = path.endsWith("/") ? path.slice(0, -1) : path;
  const name = normalized.split("/").pop() || normalized;
  const page = pages.find((entry) => normalized === entry.dir || normalized.startsWith(`${entry.dir}/`));
  return {
    path,
    name: name || path,
    kind: path.endsWith("/") ? "directory" : "file",
    assetPath: path.endsWith("/") ? undefined : path,
    pageUrl: page?.url,
    changeStatus: page?.status
  };
}

async function collectReports(siteRoot: string): Promise<ReportEntry[]> {
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

async function readCrawlManifest(siteRoot: string): Promise<CrawlManifest | null> {
  return readJsonOptional<CrawlManifest>(join(siteRoot, "crawl", "manifest.json"));
}

function originLabelFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return normalizeOrigin(url);
  }
}

function pageSlugFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname.replace(/\/$/, "") || "/";
    if (path === "/") return "home";
    return path
      .split("/")
      .filter(Boolean)
      .join("-")
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-");
  } catch {
    return "page";
  }
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readText(path: string): Promise<string> {
  return readFile(path, "utf8");
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function readJsonOptional<T>(path: string): Promise<T | null> {
  try {
    return await readJson<T>(path);
  } catch {
    return null;
  }
}

async function countIssues(pageDir: string): Promise<number> {
  const issues = await readJsonOptional<Issue[]>(join(pageDir, "issues.json"));
  return issues?.length ?? 0;
}

export async function writePageIssues(pageDir: string, _count: number, issues: Issue[]): Promise<void> {
  await writeFile(join(pageDir, "issues.json"), stringifyJson(issues), "utf8");
}
