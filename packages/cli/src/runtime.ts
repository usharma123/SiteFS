import type { BrowserBackend } from "@sitefs/browser";
import { checkBrokenLinks, checkButtons, checkConsoleErrors, checkForms, checkA11y, renderMarkdownReport, buildQAReport } from "@sitefs/qa";
import { detectDangerousAction, LocalSiteFSStore, type PageSnapshot } from "@sitefs/sitefs";

export class WebRuntime {
  constructor(
    private readonly backend: BrowserBackend,
    private readonly store: LocalSiteFSStore
  ) {}

  async handle(args: string[]): Promise<string> {
    const [command, ...rest] = args;
    if (!command || command === "help" || command === "--help") return helpText();

    try {
      switch (command) {
        case "open":
          return await this.action("Opened", `open ${rest[0] ?? ""}`, async () => this.backend.open(required(rest[0], "web open <url>")));
        case "click": {
          const target = required(rest.join(" "), "web click <text-or-selector>");
          const blocked = this.guard(target);
          if (blocked) return blocked;
          return await this.action("Clicked", `click ${target}`, async () => this.backend.click(target));
        }
        case "type": {
          const [target, ...valueParts] = rest;
          const value = valueParts.join(" ");
          required(target, "web type <label-or-selector> <value>");
          required(value, "web type <label-or-selector> <value>");
          const blocked = this.guard(target);
          if (blocked) return blocked;
          return await this.action("Typed", `type ${target}`, async () => this.backend.type(target, value));
        }
        case "scroll": {
          const direction = rest[0] === "up" ? "up" : "down";
          return await this.action("Scrolled", `scroll ${direction}`, async () => this.backend.scroll(direction));
        }
        case "wait": {
          const ms = Number(rest[0] ?? 1000);
          if (!Number.isFinite(ms) || ms < 0) throw new Error("web wait <ms> requires a positive millisecond value");
          return await this.action("Waited", `wait ${ms}`, async () => this.backend.wait(ms));
        }
        case "back":
          return await this.action("Went back", "back", async () => this.backend.back());
        case "forward":
          return await this.action("Went forward", "forward", async () => this.backend.forward());
        case "snapshot":
          return await this.snapshotAndPersist("manual snapshot");
        case "history":
          return await this.history();
        case "current":
          return await this.current();
        case "diff":
          return await this.diff(rest[0], rest[1]);
        case "inspect":
          return await this.inspect(required(rest.join(" "), "web inspect <selector-or-text>"));
        case "save-page":
          return await this.savePage(required(rest[0], "web save-page <name>"));
        case "check-console-errors":
          return await this.checkConsoleErrors();
        case "check-broken-links":
          return await this.checkBrokenLinks();
        case "check-a11y":
          return await this.checkA11y();
        case "check-forms":
          return await this.checkForms();
        case "check-buttons":
          return await this.checkButtons();
        case "report":
          return await this.report();
        case "flow":
          return await this.flow(rest);
        default:
          return `web: unknown command "${command}"\n\n${helpText()}`;
      }
    } catch (error) {
      return `web: ${formatRuntimeError(error)}\n`;
    }
  }

  async close(): Promise<void> {
    await this.backend.close();
  }

  private async action(label: string, actionDescription: string, execute: () => Promise<void>): Promise<string> {
    await execute();
    const snapshot = await this.snapshotAndPersist(actionDescription);
    return `✓ ${label}.\n${snapshot}`;
  }

  private async snapshotAndPersist(actionDescription: string): Promise<string> {
    const snapshot = await this.backend.snapshot();
    await this.store.writeCurrent(snapshot);
    const id = await this.store.writeHistory(snapshot);
    await this.store.addFlowStep(actionDescription, actionDescription, id);
    return `Snapshot ${id} written to /site/current and /site/history/${id}\n`;
  }

  private async history(): Promise<string> {
    const history = await this.store.listHistory();
    return history.length ? `${history.join("\n")}\n` : "No history snapshots yet.\n";
  }

  private async current(): Promise<string> {
    const snapshot = await this.store.readSnapshot("current");
    return [
      `URL: ${snapshot.url}`,
      `Title: ${snapshot.title}`,
      `Buttons: ${snapshot.buttons.length}`,
      `Inputs: ${snapshot.inputs.length}`,
      `Forms: ${snapshot.forms.length}`,
      "Current files are under /site/current"
    ].join("\n") + "\n";
  }

  private async diff(beforeIdArg: string | undefined, afterIdArg: string | undefined): Promise<string> {
    let beforeId = beforeIdArg;
    let afterId = afterIdArg;
    if (beforeId === "latest" && afterId === undefined) {
      const history = await this.store.listHistory();
      if (history.length < 2) throw new Error("web diff latest requires at least two history snapshots.");
      beforeId = history[history.length - 2];
      afterId = history[history.length - 1];
    }
    beforeId = required(beforeId, "web diff <snapshot-a> <snapshot-b> or web diff latest");
    afterId = required(afterId, "web diff <snapshot-a> <snapshot-b> or web diff latest");
    return this.store.writeDiff(beforeId, afterId);
  }

  private async inspect(target: string): Promise<string> {
    const snapshot = await this.store.readSnapshot("current");
    const needle = target.toLowerCase();
    const foundMatches = [
      ...snapshot.buttons.filter((button) => matches(button.text, button.selector, needle)),
      ...snapshot.inputs.filter((input) => matches(input.label, input.name, needle) || matches(input.selector, input.type, needle)),
      ...snapshot.links.filter((link) => matches(link.text, link.href, needle)),
      ...snapshot.forms.filter((form) => matches(form.name, form.selector, needle))
    ];
    return foundMatches.length ? `${JSON.stringify(foundMatches, null, 2)}\n` : `No current snapshot element matched "${target}".\n`;
  }

  private async savePage(name: string): Promise<string> {
    await this.store.copyCurrentToPage(name);
    return `Saved /site/current to /site/pages/${name}\n`;
  }

  private async checkConsoleErrors(): Promise<string> {
    const issues = checkConsoleErrors(await this.store.readSnapshot("current"));
    const report = renderIssueReport("Console Errors", issues);
    await this.store.writeReport("console-errors.md", report);
    return report;
  }

  private async checkBrokenLinks(): Promise<string> {
    const issues = await checkBrokenLinks(await this.store.readSnapshot("current"));
    const report = renderIssueReport("Broken Links", issues);
    await this.store.writeReport("broken-links.md", report);
    return report;
  }

  private async checkA11y(): Promise<string> {
    const issues = checkA11y(await this.store.readSnapshot("current"));
    const report = renderIssueReport("Accessibility", issues);
    await this.store.writeReport("accessibility.md", report);
    return report;
  }

  private async checkForms(): Promise<string> {
    const issues = checkForms(await this.store.readSnapshot("current"));
    return renderIssueReport("Forms", issues);
  }

  private async checkButtons(): Promise<string> {
    const issues = checkButtons(await this.store.readSnapshot("current"));
    return renderIssueReport("Buttons", issues);
  }

  private async report(): Promise<string> {
    const snapshot = await this.store.readSnapshot("current");
    const history = await this.store.listHistory();
    const flow = await this.store.getActiveFlow();
    const report = buildQAReport(snapshot, history, [], flow?.name);
    const markdown = renderMarkdownReport(report, snapshot);
    await this.store.writeReport("qa-summary.md", markdown);
    return `${markdown}\nReport written to /site/reports/qa-summary.md\n`;
  }

  private async flow(args: string[]): Promise<string> {
    const [subcommand, ...rest] = args;
    switch (subcommand) {
      case "start": {
        const flow = await this.store.startFlow(required(rest[0], "web flow start <name>"));
        return `Started flow "${flow.name}".\n`;
      }
      case "step": {
        const description = required(rest.join(" "), "web flow step <description>");
        const flow = await this.store.addFlowStep(description);
        return flow ? `Recorded flow step ${flow.steps.length}.\n` : "No active flow. Run web flow start <name> first.\n";
      }
      case "end": {
        const flow = await this.store.endFlow();
        return flow ? `Ended flow "${flow.name}".\n` : "No active flow.\n";
      }
      case "report": {
        const name = rest[0];
        const flow = name ? await this.store.getFlow(name) : await this.store.getActiveFlow();
        if (!flow) return name ? `No flow named "${name}" found under /site/flows.\n` : "No active flow. Run web flow report <name>, or inspect /site/flows.\n";
        return this.store.writeFlowReport(flow);
      }
      default:
        return "Usage: web flow start <name> | step <description> | end | report [name]\n";
    }
  }

  private guard(text: string): string | null {
    const danger = detectDangerousAction(text);
    if (!danger) return null;
    return [
      `Approval required before interacting with "${text}".`,
      `Reason: destructive or high-impact action detected (${danger}).`,
      "MVP guardrails block this action; no bypass is available yet.",
      ""
    ].join("\n");
  }
}

function required(value: string | undefined, usage: string): string {
  if (!value) throw new Error(`Usage: ${usage}`);
  return value;
}

function matches(a: string | undefined, b: string | undefined, needle: string): boolean {
  return Boolean(a?.toLowerCase().includes(needle) || b?.toLowerCase().includes(needle));
}

function renderIssueReport(title: string, issues: Array<{ severity: string; code: string; message: string }>): string {
  return [
    `# ${title}`,
    "",
    ...(issues.length ? issues.map((issue) => `- [${issue.severity}] ${issue.code}: ${issue.message}`) : ["- No issues detected."]),
    ""
  ].join("\n");
}

function helpText(): string {
  return `Usage:
  web open <url>
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
  web inspect <selector-or-text>
  web save-page <name>
  web check-console-errors
  web check-broken-links
  web check-a11y
  web check-forms
  web check-buttons
  web report
  web flow start <name>
  web flow step <description>
  web flow end
  web flow report [name]
`;
}

function formatRuntimeError(error: unknown): string {
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
