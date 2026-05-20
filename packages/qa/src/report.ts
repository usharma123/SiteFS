import type { Issue, PageSnapshot, QAReport } from "@sitefs/sitefs";

export interface BuildQAReportOptions {
  failOnWarnings?: boolean;
}

export function buildQAReport(
  snapshot: PageSnapshot,
  snapshots: string[] = [],
  issues: Issue[] = [],
  flowName?: string,
  options: BuildQAReportOptions = {}
): QAReport {
  const failOnWarnings = options.failOnWarnings ?? false;
  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;
  const passed = errorCount === 0 && (!failOnWarnings || warningCount === 0);
  return {
    url: snapshot.url,
    flowName,
    passed,
    issues,
    snapshots,
    summary: `${errorCount} error(s), ${warningCount} warning(s)`
  };
}

export function renderMarkdownReport(report: QAReport, snapshot: PageSnapshot): string {
  const lines = [
    "# SiteFS QA Summary",
    "",
    `URL: ${report.url}`,
    `Title: ${snapshot.title}`,
    report.flowName ? `Flow: ${report.flowName}` : undefined,
    `Result: ${report.passed ? "Passed" : "Failed"}`,
    `Summary: ${report.summary}`,
    "",
    "## Issues",
    ...renderIssues(report.issues),
    "",
    "## Page State",
    `- Links: ${snapshot.links.length}`,
    `- Buttons: ${snapshot.buttons.length}`,
    `- Inputs: ${snapshot.inputs.length}`,
    `- Forms: ${snapshot.forms.length}`,
    `- Console entries: ${snapshot.consoleLogs.length}`,
    `- Network failure entries: ${snapshot.networkLogs.filter((entry) => entry.failure || (entry.status && entry.status >= 400)).length}`,
    "",
    "## Snapshots",
    ...(report.snapshots.length ? report.snapshots.map((id) => `- ${id}`) : ["- current"])
  ].filter((line): line is string => line !== undefined);
  return `${lines.join("\n")}\n`;
}

export function renderJsonReport(report: QAReport, snapshot: PageSnapshot): string {
  return `${JSON.stringify(
    {
      url: report.url,
      title: snapshot.title,
      flowName: report.flowName,
      passed: report.passed,
      summary: report.summary,
      issues: report.issues,
      snapshots: report.snapshots,
      pageState: {
        links: snapshot.links.length,
        buttons: snapshot.buttons.length,
        inputs: snapshot.inputs.length,
        forms: snapshot.forms.length,
        consoleEntries: snapshot.consoleLogs.length,
        networkFailures: snapshot.networkLogs.filter(
          (entry) => entry.failure || (entry.status && entry.status >= 400)
        ).length
      }
    },
    null,
    2
  )}\n`;
}

function renderIssues(issues: Issue[]): string[] {
  if (!issues.length) return ["- No issues detected."];
  return issues.map((issue) => `- [${issue.severity}] ${issue.code}: ${issue.message}`);
}
