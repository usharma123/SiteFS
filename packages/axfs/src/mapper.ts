import type { AxCdpNode, AxCdpTree, AxEntry, AxFilesystem } from "./types.js";
import { CONTAINER_ROLES } from "./types.js";
import { dedupeSegment, generateSegment } from "./naming.js";

export function buildAxFilesystem(cdp: AxCdpTree | unknown): AxFilesystem {
  const tree = normalizeCdp(cdp);
  const nodes = tree.nodes ?? [];
  const byId = new Map<string, AxCdpNode>();
  for (const node of nodes) {
    if (node.nodeId) byId.set(node.nodeId, node);
  }
  for (const node of nodes) {
    if (!node.nodeId || !node.parentId) continue;
    const parent = byId.get(node.parentId);
    if (!parent) continue;
    if (!parent.childIds) parent.childIds = [];
    if (!parent.childIds.includes(node.nodeId)) parent.childIds.push(node.nodeId);
  }

  const roots = nodes.filter((n) => !n.parentId || !byId.has(n.parentId));
  const usedAtLevel = new Map<string, Set<string>>();
  let nodeCount = 0;

  const build = (cdpNode: AxCdpNode, parentPath: string): AxEntry | null => {
    const role = cdpNode.role?.value ?? cdpNode.role?.type ?? "generic";
    const name = cdpNode.name?.value ?? "";
    const childIds = cdpNode.childIds ?? [];
    const childrenCdp = childIds.map((id) => byId.get(id)).filter(Boolean) as AxCdpNode[];

    const shouldFlatten =
      (role === "generic" || role === "none") &&
      !name &&
      childrenCdp.length === 1 &&
      !isIframeRole(childrenCdp[0]);

    if (shouldFlatten) {
      return build(childrenCdp[0], parentPath);
    }

    const isDirectory = isContainer(role, childrenCdp.length > 0);
    const levelKey = parentPath || "/";
    if (!usedAtLevel.has(levelKey)) usedAtLevel.set(levelKey, new Set());
    const used = usedAtLevel.get(levelKey)!;
    const label =
      isDirectory && (CONTAINER_ROLES.has(role) || role === "none" || role === "generic") ? role || name : name;
    const segment = dedupeSegment(generateSegment(label, role, isDirectory), used);
    const path = parentPath
      ? `${parentPath.replace(/\/$/, "")}/${segment.replace(/\/$/, "")}`
      : segment.replace(/\/$/, "");

    const children: AxEntry[] = [];
    for (const child of childrenCdp) {
      const built = build(child, path);
      if (built) children.push(built);
    }

    nodeCount++;
    const entry: AxEntry = {
      id: cdpNode.nodeId ?? path,
      segment,
      path: path.endsWith("/") ? path : path,
      role,
      name,
      value: cdpNode.value?.value,
      description: cdpNode.description?.value,
      backendDOMNodeId: cdpNode.backendDOMNodeId,
      isDirectory,
      childIds,
      children
    };
    return entry;
  };

  const rootChildren: AxEntry[] = [];
  const rootSources = roots.length ? roots : nodes.slice(0, 1);
  for (const r of rootSources) {
    const role = r.role?.value ?? r.role?.type ?? "";
    if (role === "RootWebArea" || role === "WebArea") {
      for (const childId of r.childIds ?? []) {
        const child = byId.get(childId);
        if (!child) continue;
        const built = build(child, "");
        if (built) rootChildren.push(built);
      }
      continue;
    }
    const built = build(r, "");
    if (built) rootChildren.push(built);
  }

  let topChildren = rootChildren;
  if (
    topChildren.length === 1 &&
    (topChildren[0].role === "none" || topChildren[0].segment.startsWith("none"))
  ) {
    topChildren = topChildren[0].children;
  }

  const root: AxEntry = {
    id: "root",
    segment: "",
    path: "/",
    role: "RootWebArea",
    name: "",
    isDirectory: true,
    childIds: [],
    children: topChildren
  };

  const entriesByPath = new Map<string, AxEntry>();
  const index = (entry: AxEntry) => {
    entriesByPath.set(normalizePath(entry.path), entry);
    for (const child of entry.children) index(child);
  };
  index(root);

  return { root, entriesByPath, nodeCount };
}

function normalizeCdp(cdp: unknown): AxCdpTree {
  if (!cdp || typeof cdp !== "object") return { nodes: [] };
  const obj = cdp as Record<string, unknown>;
  if (Array.isArray(obj.nodes)) return { nodes: obj.nodes as AxCdpTree["nodes"] };
  return { nodes: [] };
}

function isContainer(role: string, hasChildren: boolean): boolean {
  if (CONTAINER_ROLES.has(role)) return true;
  return hasChildren && (role === "generic" || role === "none" || role === "WebArea" || role === "RootWebArea");
}

function isIframeRole(node?: AxCdpNode): boolean {
  const role = node?.role?.value ?? node?.role?.type ?? "";
  return role.toLowerCase().includes("iframe");
}

export function normalizePath(path: string): string {
  if (!path || path === "/" || path === "~") return "";
  return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\//, "").replace(/\/$/, "");
}

export function resolvePath(fs: AxFilesystem, rawPath: string, cwd: string): AxEntry | undefined {
  const trimmed = rawPath.trim();
  if (trimmed === "/" || trimmed === "~" || trimmed === "" || trimmed === ".") return fs.root;
  if (trimmed === "..") {
    const parts = normalizePath(cwd).split("/").filter(Boolean);
    parts.pop();
    const parent = parts.length ? parts.join("/") : "/";
    return fs.entriesByPath.get(parent === "/" ? "/" : parent) ?? fs.root;
  }

  const cwdNorm = cwd === "/" || cwd === "~" ? "" : normalizePath(cwd);
  const base = trimmed.startsWith("/") || (trimmed.includes("/") && !trimmed.startsWith("tabs")) ? "" : cwdNorm;
  const combined = trimmed.startsWith("/")
    ? normalizePath(trimmed)
    : base
      ? `${base}/${normalizePath(trimmed)}`
      : normalizePath(trimmed);

  return fs.entriesByPath.get(combined) ?? fs.entriesByPath.get(`${combined}/`);
}

export function listChildren(entry: AxEntry, opts: import("./types.js").ListOptions = {}): AxEntry[] {
  let items = [...entry.children];
  if (opts.type) {
    const roles = matchTypeFilter(opts.type);
    items = items.filter((c) => roles.some((r) => c.role.toLowerCase().includes(r)));
  }
  if (opts.after) {
    const idx = items.findIndex((c) => c.segment.includes(opts.after!));
    if (idx >= 0) items = items.slice(idx + 1);
  }
  if (opts.before) {
    const idx = items.findIndex((c) => c.segment.includes(opts.before!));
    if (idx >= 0) items = items.slice(0, idx);
  }
  if (opts.offset) items = items.slice(opts.offset);
  if (opts.limit) items = items.slice(0, opts.limit);
  return items;
}

export function matchTypeFilter(type: string): string[] {
  const lower = type.toLowerCase();
  const aliases: Record<string, string[]> = {
    input: ["textbox", "searchbox", "spinbutton", "combobox"],
    button: ["button"],
    link: ["link"],
    dropdown: ["combobox", "listbox"],
    nav: ["navigation"],
    toggle: ["switch", "checkbox", "radio"],
    modal: ["dialog", "alertdialog"],
    image: ["img", "image"],
    heading: ["heading"]
  };
  return aliases[lower] ?? [lower];
}
