import type { Issue, LinkProbeResult, PageSnapshot } from "@sitefs/sitefs";
import { checkBrokenLinks, checkAxeViolations, runStaticChecks } from "./checks.js";

export type LinkScope = "same-origin" | "all";

export interface CheckOptions {
  linkScope: LinkScope;
  failOnWarnings: boolean;
}

export async function runAllChecks(
  snapshot: PageSnapshot,
  probeLink: (href: string) => Promise<LinkProbeResult>,
  options: CheckOptions
): Promise<Issue[]> {
  const staticIssues = runStaticChecks(snapshot);
  const linkIssues = await checkBrokenLinks(snapshot, probeLink, options.linkScope);
  const axeIssues = checkAxeViolations(snapshot);
  return [...staticIssues, ...linkIssues, ...axeIssues];
}
