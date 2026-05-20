import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "playwright";
import type { AxeViolationSummary } from "@sitefs/sitefs";

export async function getAccessibilityTree(page: Page): Promise<unknown> {
  try {
    const session = await page.context().newCDPSession(page);
    await session.send("Accessibility.enable");
    const result = await session.send("Accessibility.getFullAXTree");
    await session.detach();
    return result;
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function runAxe(page: Page): Promise<AxeViolationSummary[]> {
  try {
    const results = await new AxeBuilder({ page }).analyze();
    return results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact ?? undefined,
      description: violation.description,
      help: violation.help,
      nodes: violation.nodes.length
    }));
  } catch {
    return [];
  }
}
