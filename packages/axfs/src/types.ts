export interface AxCdpNode {
  nodeId?: string;
  role?: { type?: string; value?: string };
  name?: { type?: string; value?: string };
  description?: { type?: string; value?: string };
  value?: { type?: string; value?: string };
  childIds?: string[];
  backendDOMNodeId?: number;
  parentId?: string;
}

export interface AxCdpTree {
  nodes?: AxCdpNode[];
}

export interface AxEntry {
  id: string;
  segment: string;
  path: string;
  role: string;
  name: string;
  value?: string;
  description?: string;
  backendDOMNodeId?: number;
  isDirectory: boolean;
  childIds: string[];
  children: AxEntry[];
}

export interface AxFilesystem {
  root: AxEntry;
  entriesByPath: Map<string, AxEntry>;
  nodeCount: number;
}

export interface ListOptions {
  long?: boolean;
  meta?: boolean;
  text?: boolean;
  textlen?: number;
  recursive?: boolean;
  limit?: number;
  offset?: number;
  type?: string;
  count?: boolean;
  after?: string;
  before?: string;
  json?: boolean;
}

export interface FindOptions {
  pattern?: string;
  type?: string;
  meta?: boolean;
  text?: boolean;
  content?: boolean;
  recursive?: boolean;
  limit?: number;
  json?: boolean;
}

export interface GrepOptions {
  pattern: string;
  recursive?: boolean;
  content?: boolean;
  limit?: number;
}

export interface AxDiffEntry {
  path: string;
  change: "added" | "removed" | "changed";
  before?: string;
  after?: string;
}

export const CONTAINER_ROLES = new Set([
  "navigation",
  "main",
  "complementary",
  "contentinfo",
  "banner",
  "form",
  "search",
  "list",
  "region",
  "dialog",
  "menu",
  "menubar",
  "table",
  "grid",
  "row",
  "rowgroup",
  "tablist",
  "group",
  "article",
  "section",
  "Iframe",
  "RootWebArea",
  "WebArea",
  "generic"
]);

export const TYPE_ALIASES: Record<string, string[]> = {
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
