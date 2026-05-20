import type { Issue, LinkInfo, LinkProbeResult, PageSnapshot } from "@sitefs/sitefs";

const blockedHostPatterns = [/linkedin\.com/i, /twitter\.com/i, /x\.com/i];
const blockedStatuses = new Set([403, 999]);

export function checkConsoleErrors(snapshot: PageSnapshot): Issue[] {
  return snapshot.consoleLogs
    .filter((entry) => entry.type === "error")
    .map((entry) => ({
      severity: "error" as const,
      code: "console-error",
      message: entry.text,
      details: entry.location
    }));
}

export function checkNetworkFailures(snapshot: PageSnapshot): Issue[] {
  return snapshot.networkLogs
    .filter((entry) => entry.failure || (entry.status && entry.status >= 400))
    .map((entry) => ({
      severity: (entry.status && entry.status < 500 ? "warning" : "error") as Issue["severity"],
      code: "network-failure",
      message: `${entry.method} ${entry.url} ${entry.status ?? entry.failure ?? ""}`.trim(),
      details: entry
    }));
}

export function checkForms(snapshot: PageSnapshot): Issue[] {
  const issues: Issue[] = [];
  for (const form of snapshot.forms) {
    if (!form.fields.length) {
      issues.push({
        severity: "warning",
        code: "form-without-fields",
        message: `Form "${form.name}" has no detected fields.`,
        details: form.selector
      });
    }
    if (!form.submit) {
      issues.push({
        severity: "warning",
        code: "form-without-submit",
        message: `Form "${form.name}" has no detected submit control.`,
        details: form.selector
      });
    }
  }
  for (const input of snapshot.inputs) {
    if (input.visible && !input.label) {
      issues.push({
        severity: "warning",
        code: "input-missing-label",
        message: `Input "${input.selector}" has no detected label.`,
        details: input
      });
    }
  }
  return issues;
}

export function checkButtons(snapshot: PageSnapshot): Issue[] {
  return snapshot.buttons
    .filter((button) => button.visible && !button.text)
    .map((button) => ({
      severity: "warning" as const,
      code: "button-missing-text",
      message: `Visible button "${button.selector}" has no detected text.`,
      details: button
    }));
}

export function checkA11y(snapshot: PageSnapshot): Issue[] {
  const tree = snapshot.accessibilityTree as { issues?: Array<{ code: string; message: string; selector?: string }> };
  return (tree.issues ?? []).map((issue) => ({
    severity: "warning" as const,
    code: issue.code,
    message: issue.message,
    details: issue.selector
  }));
}

export function checkAxeViolations(snapshot: PageSnapshot): Issue[] {
  return (snapshot.axeViolations ?? []).map((violation) => {
    const impact = violation.impact ?? "minor";
    const severity: Issue["severity"] =
      impact === "critical" || impact === "serious" ? "error" : impact === "moderate" ? "warning" : "info";
    return {
      severity,
      code: `axe-${violation.id}`,
      message: `${violation.description} (${violation.nodes} node(s))`,
      details: violation.help
    };
  });
}

function isHttpLink(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

function shouldSkipLink(href: string): boolean {
  if (!isHttpLink(href)) return true;
  if (/^(mailto:|tel:|javascript:)/i.test(href)) return true;
  try {
    const url = new URL(href);
    if (!url.pathname || url.pathname === "" && !url.search && url.hash) return true;
    if (url.hash && url.pathname === "/" && !url.search) return false;
  } catch {
    return true;
  }
  return false;
}

function sameOrigin(pageUrl: string, linkHref: string): boolean {
  try {
    return new URL(linkHref).origin === new URL(pageUrl).origin;
  } catch {
    return false;
  }
}

function isBlockedHost(href: string): boolean {
  try {
    const host = new URL(href).hostname;
    return blockedHostPatterns.some((pattern) => pattern.test(host));
  } catch {
    return false;
  }
}

function classifyLinkIssue(link: LinkInfo, probe: LinkProbeResult): Issue | null {
  if (probe.ok) return null;

  if (probe.blocked || (probe.status !== undefined && blockedStatuses.has(probe.status)) || isBlockedHost(link.href)) {
    return {
      severity: "warning",
      code: "link-blocked",
      message: `Third-party may block automated checks: ${probe.status ?? "blocked"} ${link.href}`,
      details: link
    };
  }

  if (probe.error) {
    return {
      severity: "warning",
      code: "broken-link",
      message: `Failed to fetch ${link.href}: ${probe.error}`,
      details: link
    };
  }

  if (probe.status !== undefined && probe.status >= 400) {
    return {
      severity: "warning",
      code: "broken-link",
      message: `${probe.status} ${link.href}`,
      details: link
    };
  }

  return null;
}

export async function checkBrokenLinks(
  snapshot: PageSnapshot,
  probeLink: (href: string) => Promise<LinkProbeResult>,
  linkScope: "same-origin" | "all" = "same-origin"
): Promise<Issue[]> {
  const issues: Issue[] = [];
  let links = snapshot.links.filter((link) => link.visible && isHttpLink(link.href) && !shouldSkipLink(link.href));
  if (linkScope === "same-origin") {
    links = links.filter((link) => sameOrigin(snapshot.url, link.href));
  }
  links = links.slice(0, 50);

  await Promise.all(
    links.map(async (link) => {
      const probe = await probeLink(link.href);
      const issue = classifyLinkIssue(link, probe);
      if (issue) issues.push(issue);
    })
  );

  return issues.sort((a, b) => a.message.localeCompare(b.message));
}

/** @deprecated Use checkBrokenLinks with probeLink */
export async function checkBrokenLinksLegacy(snapshot: PageSnapshot): Promise<Issue[]> {
  return checkBrokenLinks(snapshot, async (href) => {
    try {
      const response = await fetch(href, { method: "HEAD", redirect: "follow" });
      return { ok: response.status < 400, status: response.status };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }, "all");
}

export function runStaticChecks(snapshot: PageSnapshot): Issue[] {
  return [
    ...checkConsoleErrors(snapshot),
    ...checkNetworkFailures(snapshot),
    ...checkForms(snapshot),
    ...checkButtons(snapshot),
    ...checkA11y(snapshot)
  ];
}
