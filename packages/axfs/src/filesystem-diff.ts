import type { AxDiffEntry, AxFilesystem } from "./types.js";

export function diffAxFilesystem(before: AxFilesystem, after: AxFilesystem): AxDiffEntry[] {
  const changes: AxDiffEntry[] = [];
  const beforePaths = new Set(before.entriesByPath.keys());
  const afterPaths = new Set(after.entriesByPath.keys());

  for (const path of afterPaths) {
    if (path === "/") continue;
    if (!beforePaths.has(path)) {
      const entry = after.entriesByPath.get(path);
      changes.push({ path, change: "added", after: entry?.segment });
    }
  }

  for (const path of beforePaths) {
    if (path === "/") continue;
    if (!afterPaths.has(path)) {
      const entry = before.entriesByPath.get(path);
      changes.push({ path, change: "removed", before: entry?.segment });
    }
  }

  for (const path of afterPaths) {
    if (path === "/" || !beforePaths.has(path)) continue;
    const b = before.entriesByPath.get(path);
    const a = after.entriesByPath.get(path);
    if (b && a && (b.name !== a.name || b.role !== a.role || b.segment !== a.segment)) {
      changes.push({
        path,
        change: "changed",
        before: `${b.segment} (${b.role})`,
        after: `${a.segment} (${a.role})`
      });
    }
  }

  return changes;
}
