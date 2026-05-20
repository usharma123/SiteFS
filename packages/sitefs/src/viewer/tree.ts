import type { PageIndexEntry, ViewerTreeNode } from "./types.js";

export const PAGE_ARTIFACTS = [
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

export function buildTreePaths(_siteRoot: string, pages: PageIndexEntry[]): string[] {
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

export function nodeFromPath(path: string, pages: PageIndexEntry[]): ViewerTreeNode {
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
