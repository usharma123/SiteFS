import type { AxEntry } from "./types.js";

const TABLE_ROLES = new Set(["table", "grid"]);
const ROW_ROLES = new Set(["row", "rowgroup"]);
const CELL_ROLES = new Set(["cell", "columnheader", "gridcell", "rowheader"]);

export function findTableEntry(entry: AxEntry): AxEntry | undefined {
  const role = entry.role.toLowerCase();
  if (TABLE_ROLES.has(role)) return entry;
  for (const child of entry.children) {
    const found = findTableEntry(child);
    if (found) return found;
  }
  return undefined;
}

export function extractTable(entry: AxEntry, format: "md" | "csv" = "md"): string {
  const table = TABLE_ROLES.has(entry.role.toLowerCase()) ? entry : findTableEntry(entry);
  if (!table) return "No table found at path.\n";

  const rows = collectRows(table);
  if (rows.length === 0) return "Table has no rows.\n";

  return format === "csv" ? toCsv(rows) : toMarkdown(rows);
}

function collectRows(table: AxEntry): string[][] {
  const out: string[][] = [];

  const walkRows = (node: AxEntry) => {
    const role = node.role.toLowerCase();
    if (role === "row") {
      const cells = collectCells(node);
      if (cells.length > 0) out.push(cells);
      return;
    }
    if (ROW_ROLES.has(role)) {
      for (const child of node.children) walkRows(child);
      return;
    }
    for (const child of node.children) walkRows(child);
  };

  walkRows(table);
  return out;
}

function collectCells(row: AxEntry): string[] {
  const cells: string[] = [];
  const walk = (node: AxEntry) => {
    const role = node.role.toLowerCase();
    if (CELL_ROLES.has(role)) {
      cells.push(cellText(node));
      return;
    }
    for (const child of node.children) walk(child);
  };
  walk(row);
  return cells;
}

function cellText(entry: AxEntry): string {
  const parts = [entry.name, entry.value, entry.description].filter(Boolean);
  if (parts.length > 0) return parts.join(" ").trim();
  if (entry.children.length === 0) return entry.segment;
  const nested: string[] = [];
  const walk = (e: AxEntry) => {
    if (e.name) nested.push(e.name);
    else if (e.value) nested.push(e.value);
    for (const c of e.children) walk(c);
  };
  walk(entry);
  return nested.join(" ").trim() || entry.segment;
}

function toMarkdown(rows: string[][]): string {
  const width = Math.max(...rows.map((r) => r.length));
  const padded = rows.map((r) => {
    const copy = [...r];
    while (copy.length < width) copy.push("");
    return copy.map((c) => c.replace(/\|/g, "\\|").replace(/\n/g, " "));
  });
  if (padded.length === 0) return "";
  const header = padded[0]!;
  const sep = header.map(() => "---");
  const body = padded.slice(1);
  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${sep.join(" | ")} |`,
    ...body.map((r) => `| ${r.join(" | ")} |`)
  ];
  return lines.join("\n") + "\n";
}

function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(escapeCsv).join(",")).join("\n") + "\n";
}

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
