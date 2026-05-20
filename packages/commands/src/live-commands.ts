/** Canonical live-shell command names (just-bash custom commands + BrowserHost dispatch). */
export const LIVE_COMMAND_NAMES = [
  "tabs",
  "windows",
  "here",
  "navigate",
  "goto",
  "open",
  "back",
  "forward",
  "close",
  "ls",
  "cd",
  "pwd",
  "tree",
  "refresh",
  "cat",
  "text",
  "read",
  "grep",
  "find",
  "extract_links",
  "extract_table",
  "click",
  "focus",
  "type",
  "submit",
  "scroll",
  "select",
  "wait",
  "js",
  "eval",
  "screenshot",
  "diff",
  "watch",
  "for",
  "each",
  "script",
  "functions",
  "call",
  "whoami",
  "env",
  "export",
  "history",
  "bookmark",
  "debug",
  "help",
  "clear",
  "web"
] as const;

export type LiveCommandName = (typeof LIVE_COMMAND_NAMES)[number];

const LIVE_SET = new Set<string>(LIVE_COMMAND_NAMES);

export function isLiveCommand(name: string): name is LiveCommandName {
  return LIVE_SET.has(name);
}

/** Commands handled by BrowserHost (includes meta + web passthrough). */
export const HOST_COMMAND_NAMES = [
  ...LIVE_COMMAND_NAMES,
  "help",
  "clear"
] as const;

const HOST_SET = new Set<string>(HOST_COMMAND_NAMES);

export function isHostCommand(name: string): boolean {
  return HOST_SET.has(name);
}
