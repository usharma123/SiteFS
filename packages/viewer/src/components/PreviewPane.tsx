import { useEffect, useState } from "react";
import type { PageIndexEntry, ViewerManifest } from "@sitefs/sitefs";
import { assetUrl, isImagePath, isJsonPath } from "../api";

interface PreviewPaneProps {
  manifest: ViewerManifest;
  selectedPath?: string;
  page?: PageIndexEntry;
}

export function PreviewPane({ manifest, selectedPath, page }: PreviewPaneProps) {
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedPath || isImagePath(selectedPath)) {
      setContent("");
      return;
    }
    setLoading(true);
    fetch(assetUrl(selectedPath))
      .then((response) => response.text())
      .then(setContent)
      .catch((error) => setContent(error instanceof Error ? error.message : String(error)))
      .finally(() => setLoading(false));
  }, [selectedPath]);

  if (!selectedPath) {
    return <div className="sitefs-empty">Select a file from the site tree.</div>;
  }

  if (isImagePath(selectedPath)) {
    return (
      <div className="sitefs-preview">
        {page ? (
          <>
            <h2>{page.title}</h2>
            <div className="sitefs-preview-url">{page.url}</div>
          </>
        ) : null}
        <img src={assetUrl(selectedPath)} alt={selectedPath} />
      </div>
    );
  }

  return (
    <div className="sitefs-preview">
      {page ? (
        <>
          <h2>{page.title}</h2>
          <div className="sitefs-preview-url">{page.url}</div>
        </>
      ) : null}
      <div>{selectedPath}</div>
      {loading ? <div className="sitefs-empty">Loading…</div> : null}
      {!loading && isJsonPath(selectedPath) ? (
        <pre>{formatJson(content)}</pre>
      ) : !loading ? (
        <pre>{content}</pre>
      ) : null}
      {page && page.issueCount > 0 ? (
        <div className="sitefs-issues">
          <strong>{page.issueCount} issue(s) on this page</strong>
        </div>
      ) : null}
      {manifest.reports.length > 0 && selectedPath.startsWith("reports/") ? null : null}
    </div>
  );
}

function formatJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
