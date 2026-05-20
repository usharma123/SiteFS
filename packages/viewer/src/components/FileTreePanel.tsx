import { useEffect, useMemo } from "react";
import { FileTree, useFileTree } from "@pierre/trees/react";
import type { GitStatusEntry } from "@pierre/trees";
import type { ViewerManifest } from "@sitefs/sitefs";

interface FileTreePanelProps {
  manifest: ViewerManifest;
  selectedPath?: string;
  onSelectPath: (path: string) => void;
}

export function FileTreePanel({ manifest, selectedPath, onSelectPath }: FileTreePanelProps) {
  const gitStatus = useMemo<readonly GitStatusEntry[]>(
    () => Object.entries(manifest.gitStatus).map(([path, status]) => ({ path, status })),
    [manifest.gitStatus]
  );

  const { model } = useFileTree({
    paths: manifest.treePaths,
    search: true,
    gitStatus,
    initialExpansion: "open",
    onSelectionChange: (paths) => {
      const next = paths.find((path) => !path.endsWith("/"));
      if (next) onSelectPath(next);
    }
  });

  useEffect(() => {
    model.setGitStatus(gitStatus);
  }, [gitStatus, model]);

  useEffect(() => {
    if (!selectedPath) return;
    model.focusPath(selectedPath);
  }, [model, selectedPath]);

  return (
    <div className="sitefs-tree-host">
      <FileTree model={model} style={{ height: "100%" }} />
    </div>
  );
}
