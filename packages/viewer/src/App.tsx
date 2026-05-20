import { useEffect, useMemo, useState } from "react";
import type { ViewerManifest } from "@sitefs/sitefs";
import { fetchManifest, pageSlugFromAssetPath } from "./api";
import { DiffPanel } from "./components/DiffPanel";
import { FileTreePanel } from "./components/FileTreePanel";
import { PreviewPane } from "./components/PreviewPane";

export function App() {
  const [manifest, setManifest] = useState<ViewerManifest | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchManifest()
      .then((data) => {
        setManifest(data);
        const firstPage = data.pages[0];
        setSelectedPath(firstPage ? `${firstPage.dir}/visible_text.txt` : data.treePaths.find((path) => !path.endsWith("/")));
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  const selectedPage = useMemo(() => {
    if (!manifest || !selectedPath) return undefined;
    const slug = pageSlugFromAssetPath(selectedPath);
    if (!slug) return undefined;
    return manifest.pages.find((page) => page.slug === slug);
  }, [manifest, selectedPath]);

  const selectedDiff = useMemo(() => {
    if (!manifest || !selectedPage) return undefined;
    return manifest.diffs.find((diff) => diff.slug === selectedPage.slug);
  }, [manifest, selectedPage]);

  if (loading) return <div className="sitefs-loading">Loading SiteFS viewer…</div>;
  if (error || !manifest) return <div className="sitefs-error">{error ?? "Manifest unavailable"}</div>;

  const passed = manifest.run.passed;
  const changedPages = manifest.pages.filter((page) => page.status !== "unchanged").length;

  return (
    <div className="sitefs-viewer">
      <header className="sitefs-header">
        <div>
          <h1>SiteFS · {manifest.originLabel}</h1>
          <div className="sitefs-header-meta">
            <span>{manifest.run.startUrl}</span>
            <span>{manifest.run.pageCount} page(s)</span>
            {manifest.previousRun ? <span>vs run {new Date(manifest.previousRun.finishedAt).toLocaleString()}</span> : null}
          </div>
        </div>
        <div className="sitefs-header-meta">
          <span className={`sitefs-badge ${passed === false ? "failed" : "passed"}`}>
            {passed === false ? "Failed" : "Passed"}
          </span>
          {changedPages > 0 ? <span className="sitefs-badge">{changedPages} changed page(s)</span> : null}
        </div>
      </header>

      <div className="sitefs-layout">
        <section className="sitefs-panel">
          <div className="sitefs-panel-title">Site tree</div>
          <FileTreePanel
            manifest={manifest}
            selectedPath={selectedPath}
            onSelectPath={setSelectedPath}
          />
        </section>

        <section className="sitefs-panel">
          <div className="sitefs-panel-title">Preview</div>
          <PreviewPane manifest={manifest} selectedPath={selectedPath} page={selectedPage} />
        </section>

        <section className="sitefs-panel">
          <div className="sitefs-panel-title">Compare</div>
          <DiffPanel manifest={manifest} page={selectedPage} diff={selectedDiff} />
        </section>
      </div>
    </div>
  );
}
