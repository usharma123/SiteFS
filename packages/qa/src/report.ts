import type { Issue, PageSnapshot, QAReport } from "@sitefs/sitefs";
import { runStaticChecks } from "./checks.js";

export function buildQAReport(snapshot: PageSnapshot, snapshots: string[] = [], extraIssues: Issue[] = [], flowName?: string): QAReport {
  const issues = [...runStaticChecks(snapshot), ...extraIssues];
  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;
  return {
    url: snapshot.url,
    flowName,
    passed: errorCount === 0,
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

function renderIssues(issues: Issue[]): string[] {
  if (!issues.length) return ["- No issues detected by MVP checks."];
  return issues.map((issue) => `- [${issue.severity}] ${issue.code}: ${issue.message}`);
}

