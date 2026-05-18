import type { Issue, PageSnapshot } from "@sitefs/sitefs";

export function checkConsoleErrors(snapshot: PageSnapshot): Issue[] {
  return snapshot.consoleLogs
    .filter((entry) => entry.type === "error")
    .map((entry) => ({
      severity: "error",
      code: "console-error",
      message: entry.text,
      details: entry.location
    }));
}

export function checkNetworkFailures(snapshot: PageSnapshot): Issue[] {
  return snapshot.networkLogs
    .filter((entry) => entry.failure || (entry.status && entry.status >= 400))
    .map((entry) => ({
      severity: entry.status && entry.status < 500 ? "warning" : "error",
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
      severity: "warning",
      code: "button-missing-text",
      message: `Visible button "${button.selector}" has no detected text.`,
      details: button
    }));
}

export function checkA11y(snapshot: PageSnapshot): Issue[] {
  const tree = snapshot.accessibilityTree as { issues?: Array<{ code: string; message: string; selector?: string }> };
  return (tree.issues ?? []).map((issue) => ({
    severity: "warning",
    code: issue.code,
    message: issue.message,
    details: issue.selector
  }));
}

export async function checkBrokenLinks(snapshot: PageSnapshot): Promise<Issue[]> {
  const issues: Issue[] = [];
  const links = snapshot.links.filter((link) => link.visible && /^https?:\/\//.test(link.href)).slice(0, 50);
  await Promise.all(links.map(async (link) => {
    try {
      const response = await fetch(link.href, { method: "HEAD", redirect: "follow" });
      if (response.status >= 400) {
        issues.push({
          severity: "warning",
          code: "broken-link",
          message: `${response.status} ${link.href}`,
          details: link
        });
      }
    } catch (error) {
      issues.push({
        severity: "warning",
        code: "broken-link",
        message: `Failed to fetch ${link.href}`,
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }));
  return issues.sort((a, b) => a.message.localeCompare(b.message));
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

