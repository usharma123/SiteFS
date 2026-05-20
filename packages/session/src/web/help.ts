export function required(value: string | undefined, usage: string): string {
  if (!value) throw new Error(`Usage: ${usage}`);
  return value;
}

export function matches(a: string | undefined, b: string | undefined, needle: string): boolean {
  return Boolean(a?.toLowerCase().includes(needle) || b?.toLowerCase().includes(needle));
}

export function renderIssueReport(title: string, issues: Array<{ severity: string; code: string; message: string }>): string {
  return [
    `# ${title}`,
    "",
    ...(issues.length ? issues.map((issue) => `- [${issue.severity}] ${issue.code}: ${issue.message}`) : ["- No issues detected."]),
    ""
  ].join("\n");
}

export function helpText(): string {
  return `Usage:
  web open <url> [--wait-for <selector>]
  web click <text-or-selector>
  web type <label-or-selector> <value>
  web scroll <up|down>
  web wait <ms>
  web back
  web forward
  web snapshot
  web history
  web current
  web diff <snapshot-a> <snapshot-b>
  web diff latest
  web diff-visual <snapshot-a> <snapshot-b>
  web diff-visual latest
  web inspect <selector-or-text>
  web save-page <name>
  web crawl [url] [--max-pages=N] [--all-links]
  web check-console-errors
  web check-broken-links [--all-links]
  web check-a11y
  web check-forms
  web check-buttons
  web check-all
  web report
  web flow start <name>
  web flow step <description>
  web flow end
  web flow report [name]
`;
}

export function formatRuntimeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/Executable doesn't exist|Looks like Playwright was just installed/i.test(message)) {
    return [
      "Playwright Chromium is not installed.",
      "Run: node scripts/pnpm.mjs --filter @sitefs/browser exec playwright install chromium"
    ].join("\n");
  }
  if (/ENOENT: no such file or directory, open .*current/.test(message)) {
    return "No current snapshot exists yet. Run `web open <url>` or `web snapshot` first.";
  }
  if (/No visible element matched/.test(message)) {
    return `${message}\nTry inspecting /site/current/buttons.json, /site/current/links.json, or /site/current/forms.json.`;
  }
  return message;
}

export function normalizeUrl(url: string): string {
  const parsed = new URL(url);
  parsed.hash = "";
  return parsed.href.replace(/\/$/, "") || parsed.origin;
}

export function sameOrigin(base: string, target: string): boolean {
  try {
    return new URL(base).origin === new URL(target).origin;
  } catch {
    return false;
  }
}
