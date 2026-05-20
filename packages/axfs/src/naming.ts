const ROLE_SUFFIX: Record<string, string> = {
  button: "btn",
  link: "link",
  textbox: "input",
  searchbox: "input",
  checkbox: "chk",
  radio: "radio",
  switch: "switch",
  combobox: "combo",
  listbox: "listbox",
  heading: "heading",
  img: "img",
  image: "img"
};

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "unnamed";
}

export function roleSuffix(role: string): string {
  return ROLE_SUFFIX[role] ?? role.replace(/[^a-z0-9]/gi, "");
}

export function generateSegment(name: string, role: string, isDirectory: boolean): string {
  const base = slugify(name || role || "node");
  if (isDirectory) {
    const dirBase = base.endsWith("/") ? base.slice(0, -1) : base;
    return `${dirBase}/`;
  }
  const suffix = roleSuffix(role);
  if (base.endsWith(`_${suffix}`) || base === suffix) return base;
  return `${base}_${suffix}`;
}

export function dedupeSegment(segment: string, used: Set<string>): string {
  if (!used.has(segment)) {
    used.add(segment);
    return segment;
  }
  let i = 2;
  const base = segment.endsWith("/") ? segment.slice(0, -1) : segment;
  const slash = segment.endsWith("/") ? "/" : "";
  while (used.has(`${base}_${i}${slash}`)) i++;
  const next = `${base}_${i}${slash}`;
  used.add(next);
  return next;
}
