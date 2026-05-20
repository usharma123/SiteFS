import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stringifyJson } from "../format.js";
import { originLabelFromUrl } from "../url.js";
import type { LocalSiteFSStore } from "../store.js";
import {
  buildPageDiff,
  classifyPageChange,
  collectPages,
  collectReports,
  countIssues,
  ensureHomePage
} from "./page-index.js";
import { buildTreePaths, nodeFromPath } from "./tree.js";
import type { BuildViewerManifestOptions, PageIndexEntry, ViewerManifest } from "./types.js";
import { pageSlugFromUrl } from "../url.js";

export type {
  PageChangeStatus,
  ViewerTreeNode,
  PageIndexEntry,
  ReportEntry,
  PageDiffEntry,
  ViewerManifest,
  BuildViewerManifestOptions
} from "./types.js";

export async function buildViewerManifest(
  store: LocalSiteFSStore,
  options: BuildViewerManifestOptions
): Promise<ViewerManifest> {
  const siteRoot = store.root;
  await ensureHomePage(store);

  const currentPages = await collectPages(siteRoot);
  const previousPages = options.previousRun ? await collectPages(options.previousRun.siteRoot) : new Map();

  const pages: PageIndexEntry[] = [];
  const diffs: ViewerManifest["diffs"] = [];
  const gitStatus: ViewerManifest["gitStatus"] = {};

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

    const issueCount = current ? await countIssues(join(siteRoot, current.dir)) : 0;
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
