export function stringifyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function stringifyYaml(value: unknown, indent = 0): string {
  const pad = " ".repeat(indent);
  if (value === null || value === undefined) return "null\n";
  if (typeof value === "string") return `${quoteYaml(value)}\n`;
  if (typeof value === "number" || typeof value === "boolean") return `${String(value)}\n`;
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]\n";
    return value.map((item) => `${pad}- ${formatYamlValue(item, indent + 2)}`).join("");
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return "{}\n";
    return entries
      .map(([key, item]) => `${pad}${key}: ${formatYamlValue(item, indent + 2)}`)
      .join("");
  }
  return `${quoteYaml(String(value))}\n`;
}

function formatYamlValue(value: unknown, indent: number): string {
  if (value === null || value === undefined) return "null\n";
  if (typeof value === "string") return `${quoteYaml(value)}\n`;
  if (typeof value === "number" || typeof value === "boolean") return `${String(value)}\n`;
  return `\n${stringifyYaml(value, indent)}`;
}

function quoteYaml(value: string): string {
  if (value.length === 0) return "\"\"";
  if (/^[a-zA-Z0-9_./:@ -]+$/.test(value) && !/^\s|\s$|: /.test(value)) return value;
  return JSON.stringify(value);
}

export function slugifyName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "page";
}

