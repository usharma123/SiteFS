import { useMemo, useState } from "react";
import { MultiFileDiff } from "@pierre/diffs/react";
import type { PageDiffEntry, PageIndexEntry, ViewerManifest } from "@sitefs/sitefs";
import { assetUrl } from "../api";

interface DiffPanelProps {
  manifest: ViewerManifest;
  page?: PageIndexEntry;
  diff?: PageDiffEntry;
}

type DiffTab = "text" | "visual" | "links";

export function DiffPanel({ manifest, page, diff }: DiffPanelProps) {
  const [tab, setTab] = useState<DiffTab>("text");

  const structuralSummary = useMemo(() => {
    if (!diff?.structuralDiff) return [];
    const lines: string[] = [];
    const { links, buttons, text } = diff.structuralDiff;
    lines.push(...text.filter(Boolean));
    if (links.added.length || links.removed.length || links.changed.length) {
      lines.push(`Links: +${links.added.length} -${links.removed.length} ~${links.changed.length}`);
    }
    if (buttons.added.length || buttons.removed.length || buttons.changed.length) {
      lines.push(`Buttons: +${buttons.added.length} -${buttons.removed.length} ~${buttons.changed.length}`);
    }
    return lines;
  }, [diff]);

  if (!page) {
    return <div className="sitefs-empty">Select a page to compare against the previous run.</div>;
  }

  if (!manifest.previousRun) {
    return <div className="sitefs-empty">No previous run registered for this origin yet.</div>;
  }

  if (page.status === "unchanged") {
    return <div className="sitefs-empty">This page matches the previous run.</div>;
  }

  return (
    <div className="sitefs-diff-host">
      <div className="sitefs-tabs">
        <button type="button" className={`sitefs-tab ${tab === "text" ? "active" : ""}`} onClick={() => setTab("text")}>
          Text
        </button>
        <button type="button" className={`sitefs-tab ${tab === "visual" ? "active" : ""}`} onClick={() => setTab("visual")}>
          Visual
        </button>
        <button type="button" className={`sitefs-tab ${tab === "links" ? "active" : ""}`} onClick={() => setTab("links")}>
          Links
        </button>
      </div>

      {tab === "text" ? (
        diff?.beforeText != null || diff?.afterText != null ? (
          <MultiFileDiff
            oldFile={{
              name: `${diff.slug}/visible_text.txt`,
              contents: diff.beforeText ?? ""
            }}
            newFile={{
              name: `${diff.slug}/visible_text.txt`,
              contents: diff.afterText ?? ""
            }}
            options={{ diffStyle: "unified", diffIndicators: "bars" }}
          />
        ) : (
          <div className="sitefs-empty">
            {page.status === "added" ? "New page in this run." : page.status === "removed" ? "Page removed since last run." : "No text diff available."}
          </div>
        )
      ) : null}

      {tab === "visual" ? (
        diff?.visualDiffPath ? (
          <img src={assetUrl(diff.visualDiffPath)} alt="Visual diff" style={{ maxWidth: "100%" }} />
        ) : (
          <div className="sitefs-empty">No visual diff generated for this page.</div>
        )
      ) : null}

      {tab === "links" ? (
        <div className="sitefs-preview">
          {structuralSummary.length ? (
            <pre>{structuralSummary.join("\n")}</pre>
          ) : (
            <div className="sitefs-empty">No structural link/button changes detected.</div>
          )}
          {diff?.beforeLinks || diff?.afterLinks ? (
            <>
              <h3>Before</h3>
              <pre>{formatJson(diff.beforeLinks ?? "[]")}</pre>
              <h3>After</h3>
              <pre>{formatJson(diff.afterLinks ?? "[]")}</pre>
            </>
          ) : null}
        </div>
      ) : null}
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
