import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { diffSnapshots, diffSnapshotsJson } from "./diff.js";
import type { CrawlManifest } from "./types.js";
import { slugifyName, stringifyJson, stringifyYaml } from "./format.js";
import type { FlowState, PageSnapshot, SiteFSStore as SiteFSStoreInterface, SnapshotId } from "./types.js";

export class LocalSiteFSStore implements SiteFSStoreInterface {
  readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  async init(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await Promise.all([
      mkdir(this.path("current"), { recursive: true }),
      mkdir(this.path("history"), { recursive: true }),
      mkdir(this.path("pages"), { recursive: true }),
      mkdir(this.path("flows"), { recursive: true }),
      mkdir(this.path("reports"), { recursive: true }),
      mkdir(this.path("crawl"), { recursive: true })
    ]);
    await this.refreshSessionReadme();
  }

  path(...parts: string[]): string {
    return join(this.root, ...parts);
  }

  async writeCurrent(snapshot: PageSnapshot): Promise<void> {
    await this.writeSnapshotDir("current", { ...snapshot, id: "current", screenshotPath: "screenshot.png" });
    await this.refreshSessionReadme();
  }

  async writeHistory(snapshot: PageSnapshot): Promise<SnapshotId> {
    const id = await this.nextSnapshotId();
    const historySnapshot = { ...snapshot, id, screenshotPath: "screenshot.png" };
    await this.writeSnapshotDir(join("history", id), historySnapshot);
    return id;
  }

  async savePage(name: string, snapshot: PageSnapshot): Promise<void> {
    await this.writeSnapshotDir(join("pages", slugifyName(name)), { ...snapshot, screenshotPath: "screenshot.png" });
  }

  async writeReport(name: string, content: string): Promise<void> {
    await mkdir(this.path("reports"), { recursive: true });
    await writeFile(this.path("reports", name), content, "utf8");
  }

  async listHistory(): Promise<SnapshotId[]> {
    await mkdir(this.path("history"), { recursive: true });
    const entries = await readdir(this.path("history"), { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory() && /^\d{4}$/.test(entry.name)).map((entry) => entry.name).sort();
  }

  async readSnapshot(id: SnapshotId | "current"): Promise<PageSnapshot> {
    const base = id === "current" ? this.path("current") : this.path("history", id);
    const [url, title, visibleText, summary, links, buttons, forms, inputs, consoleLogs, networkLogs, dom, accessibilityTree, axeViolations, screenshotSha256, timestamp] =
      await Promise.all([
        readFile(join(base, "url.txt"), "utf8"),
        readFile(join(base, "title.txt"), "utf8"),
        readFile(join(base, "visible_text.txt"), "utf8"),
        readFile(join(base, "summary.md"), "utf8"),
        readJson(join(base, "links.json")),
        readJson(join(base, "buttons.json")),
        readJson(join(base, "forms.json")),
        readJson(join(base, "inputs.json")),
        readConsole(join(base, "console.log")),
        readJson(join(base, "network.json")),
        readJson(join(base, "dom.json")),
        readYamlFallback(join(base, "a11y.yaml")),
        readJsonOptional(join(base, "a11y-axe.json")),
        readTextOptional(join(base, "screenshot.sha256")),
        readTextOptional(join(base, "timestamp.txt"))
      ]);
    return {
      id,
      url: url.trim(),
      title: title.trim(),
      visibleText,
      summary,
      accessibilityTree,
      dom,
      links,
      buttons,
      forms,
      inputs,
      consoleLogs,
      networkLogs,
      screenshotPath: join(base, "screenshot.png"),
      timestamp: timestamp?.trim() || "",
      axeViolations: axeViolations ?? undefined,
      screenshotSha256: screenshotSha256?.trim() || undefined
    };
  }

  async writeDiff(beforeId: SnapshotId, afterId: SnapshotId): Promise<string> {
    const [before, after] = await Promise.all([this.readSnapshot(beforeId), this.readSnapshot(afterId)]);
    const diff = diffSnapshots(before, after);
    await this.writeReport(`diff-${beforeId}-${afterId}.md`, diff);
    await this.writeReport(`diff-${beforeId}-${afterId}.json`, diffSnapshotsJson(before, after));
    return diff;
  }

  async writeCrawlManifest(manifest: CrawlManifest): Promise<void> {
    await mkdir(this.path("crawl"), { recursive: true });
    await writeFile(this.path("crawl", "manifest.json"), stringifyJson(manifest), "utf8");
    await this.refreshSessionReadme();
  }

  async refreshSessionReadme(): Promise<void> {
    let currentUrl = "(none)";
    let currentTitle = "(none)";
    try {
      const current = await this.readSnapshot("current");
      currentUrl = current.url;
      currentTitle = current.title;
    } catch {
      // no snapshot yet
    }
    const history = await this.listHistory();
    const flow = await this.getActiveFlow();
    const readme = [
      "# SiteFS Session",
      "",
      `Current URL: ${currentUrl}`,
      `Current title: ${currentTitle}`,
      `History snapshots: ${history.length}${history.length ? ` (latest: ${history.at(-1)})` : ""}`,
      flow ? `Active flow: ${flow.name}` : "Active flow: none",
      "",
      "## Key paths",
      "- `/site/current/visible_text.txt` — visible page text",
      "- `/site/current/links.json` — detected links",
      "- `/site/current/buttons.json` — detected buttons",
      "- `/site/reports/qa-summary.md` — latest QA report",
      "- `/site/reports/qa-summary.json` — QA report (JSON)",
      "- `/site/crawl/manifest.json` — crawl results (if run)",
      "",
      "## Commands",
      "- `web report` / `web check-all` — full QA checks",
      "- `web crawl [url]` — BFS same-origin crawl",
      "- `web diff latest` — diff last two snapshots",
      "- `web diff-visual latest` — visual screenshot diff"
    ].join("\n");
    await writeFile(this.path("README.md"), `${readme}\n`, "utf8");
  }

  async startFlow(name: string): Promise<FlowState> {
    const flow: FlowState = {
      name: slugifyName(name),
      active: true,
      startedAt: new Date().toISOString(),
      steps: [],
      snapshots: []
    };
    await this.writeFlow(flow);
    await writeFile(this.path("flows", ".active.json"), stringifyJson(flow), "utf8");
    return flow;
  }

  async getActiveFlow(): Promise<FlowState | null> {
    try {
      return JSON.parse(await readFile(this.path("flows", ".active.json"), "utf8")) as FlowState;
    } catch {
      return null;
    }
  }

  async getFlow(name: string): Promise<FlowState | null> {
    try {
      return JSON.parse(await readFile(this.path("flows", slugifyName(name), "flow.json"), "utf8")) as FlowState;
    } catch {
      return null;
    }
  }

  async addFlowStep(description: string, action?: string, snapshotId?: SnapshotId): Promise<FlowState | null> {
    const flow = await this.getActiveFlow();
    if (!flow) return null;
    flow.steps.push({
      id: flow.steps.length + 1,
      description,
      action,
      snapshotId,
      timestamp: new Date().toISOString()
    });
    if (snapshotId && !flow.snapshots.includes(snapshotId)) flow.snapshots.push(snapshotId);
    await this.writeFlow(flow);
    await writeFile(this.path("flows", ".active.json"), stringifyJson(flow), "utf8");
    return flow;
  }

  async endFlow(): Promise<FlowState | null> {
    const flow = await this.getActiveFlow();
    if (!flow) return null;
    flow.active = false;
    flow.endedAt = new Date().toISOString();
    await this.writeFlow(flow);
    await rm(this.path("flows", ".active.json"), { force: true });
    return flow;
  }

  async writeFlowReport(flow: FlowState): Promise<string> {
    const diffSections: string[] = [];
    for (let index = 1; index < flow.snapshots.length; index++) {
      const beforeId = flow.snapshots[index - 1];
      const afterId = flow.snapshots[index];
      const [before, after] = await Promise.all([this.readSnapshot(beforeId), this.readSnapshot(afterId)]);
      diffSections.push(`### ${beforeId} -> ${afterId}`, "", diffSnapshots(before, after));
    }

    const report = [
      `# Flow: ${flow.name}`,
      "",
      `Started: ${flow.startedAt}`,
      flow.endedAt ? `Ended: ${flow.endedAt}` : "Status: active",
      "",
      "## Steps",
      ...flow.steps.map((step) => `${step.id}. ${step.description}${step.snapshotId ? ` (snapshot ${step.snapshotId})` : ""}`),
      "",
      "## Snapshots",
      ...(flow.snapshots.length ? flow.snapshots.map((id) => `- ${id}`) : ["- None"]),
      "",
      "## Diffs",
      ...(diffSections.length ? diffSections : ["- Not enough snapshots to diff."])
    ].join("\n");
    await mkdir(this.path("reports"), { recursive: true });
    await writeFile(this.path("flows", flow.name, "result.md"), `${report}\n`, "utf8");
    await writeFile(this.path("reports", "journey.md"), `${report}\n`, "utf8");
    return `${report}\n`;
  }

  private async writeFlow(flow: FlowState): Promise<void> {
    const dir = this.path("flows", flow.name);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "steps.json"), stringifyJson(flow.steps), "utf8");
    await writeFile(join(dir, "snapshots.json"), stringifyJson(flow.snapshots), "utf8");
    await writeFile(join(dir, "flow.json"), stringifyJson(flow), "utf8");
  }

  private async nextSnapshotId(): Promise<SnapshotId> {
    const history = await this.listHistory();
    const next = history.length ? Number(history.at(-1)) + 1 : 1;
    return String(next).padStart(4, "0");
  }

  private async writeSnapshotDir(relativeDir: string, snapshot: PageSnapshot): Promise<void> {
    const dir = this.path(relativeDir);
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });

    const screenshotBuffer = snapshot.screenshotBuffer;
    const timestamp = snapshot.timestamp || new Date().toISOString();
    const jsonSnapshot = { ...snapshot, screenshotBuffer: undefined, timestamp };
    await Promise.all([
      writeFile(join(dir, "url.txt"), `${snapshot.url}\n`, "utf8"),
      writeFile(join(dir, "timestamp.txt"), `${timestamp}\n`, "utf8"),
      writeFile(join(dir, "title.txt"), `${snapshot.title}\n`, "utf8"),
      writeFile(join(dir, "visible_text.txt"), snapshot.visibleText, "utf8"),
      writeFile(join(dir, "summary.md"), snapshot.summary, "utf8"),
      writeFile(join(dir, "a11y.yaml"), stringifyYaml(snapshot.accessibilityTree), "utf8"),
      writeFile(join(dir, "dom.json"), stringifyJson(snapshot.dom), "utf8"),
      writeFile(join(dir, "links.json"), stringifyJson(snapshot.links), "utf8"),
      writeFile(join(dir, "buttons.json"), stringifyJson(snapshot.buttons), "utf8"),
      writeFile(join(dir, "forms.json"), stringifyJson(snapshot.forms), "utf8"),
      writeFile(join(dir, "inputs.json"), stringifyJson(snapshot.inputs), "utf8"),
      writeFile(join(dir, "console.log"), snapshot.consoleLogs.map((entry) => `[${entry.timestamp}] ${entry.type.toUpperCase()} ${entry.text}`).join("\n") + "\n", "utf8"),
      writeFile(join(dir, "network.json"), stringifyJson(snapshot.networkLogs), "utf8"),
      writeFile(join(dir, "snapshot.json"), stringifyJson(jsonSnapshot), "utf8"),
      snapshot.axeViolations?.length
        ? writeFile(join(dir, "a11y-axe.json"), stringifyJson(snapshot.axeViolations), "utf8")
        : Promise.resolve(),
      snapshot.screenshotSha256
        ? writeFile(join(dir, "screenshot.sha256"), `${snapshot.screenshotSha256}\n`, "utf8")
        : Promise.resolve()
    ]);
    if (screenshotBuffer) {
      await writeFile(join(dir, "screenshot.png"), screenshotBuffer);
    }
  }

  async copyCurrentToPage(name: string): Promise<void> {
    await cp(this.path("current"), this.path("pages", slugifyName(name)), { recursive: true, force: true });
  }
}

async function readJson(path: string): Promise<any> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readConsole(path: string): Promise<any[]> {
  const text = await readFile(path, "utf8");
  return text.trim() ? text.trim().split(/\r?\n/).map((line) => ({ type: line.includes("ERROR") ? "error" : "log", text: line, timestamp: "" })) : [];
}

async function readYamlFallback(path: string): Promise<unknown> {
  return readFile(path, "utf8");
}

async function readJsonOptional(path: string): Promise<any | null> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

async function readTextOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}
