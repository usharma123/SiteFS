import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  buildAxFilesystem,
  diffAxFilesystem,
  extractLinks,
  extractTable,
  findEntries,
  grepEntries,
  listChildren,
  normalizePath,
  resolvePath,
  type AxEntry,
  type AxFilesystem,
  type FindOptions,
  type ListOptions
} from "@sitefs/axfs";
import type { LiveBrowserBackend } from "@sitefs/browser";
import { LocalSiteFSStore, type SessionConfig } from "@sitefs/sitefs";
import { WebRuntime } from "./runtime.js";

export type ShellMode = "browser" | "tab";

export interface ShellState {
  mode: ShellMode;
  tabId?: number;
  axCwd: string;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface BrowserHostOptions {
  sessionRoot: string;
  config: SessionConfig;
  allowWrite?: boolean;
  allowSensitive?: boolean;
}

export class BrowserHost {
  readonly state: ShellState = { mode: "browser", axCwd: "/" };
  private axFs: AxFilesystem | null = null;
  private preActionFs: AxFilesystem | null = null;
  private readonly env = new Map<string, string>();
  private readonly history: string[] = [];
  private readonly bookmarks = new Map<string, string>();
  private readonly auditPath: string;
  private readonly scriptsDir: string;

  constructor(
    readonly backend: LiveBrowserBackend,
    readonly store: LocalSiteFSStore,
    readonly web: WebRuntime,
    private readonly options: BrowserHostOptions
  ) {
    this.auditPath = resolve(options.sessionRoot, "audit.log");
    this.scriptsDir = resolve(options.sessionRoot, "site", "scripts");
  }

  async exec(command: string, args: string[]): Promise<ExecResult> {
    const line = [command, ...args].join(" ");
    this.history.push(line);
    await this.audit(`EXECUTE: ${line}`);

    try {
      const out = await this.dispatch(command, args);
      await this.audit(`RESULT: ${out.slice(0, 200)}`);
      return { stdout: out.endsWith("\n") ? out : `${out}\n`, stderr: "", exitCode: 0 };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await this.audit(`ERROR: ${msg}`);
      return { stdout: "", stderr: `${msg}\n`, exitCode: 1 };
    }
  }

  async executeLine(line: string): Promise<ExecResult> {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return { stdout: "", stderr: "", exitCode: 0 };
    const histMatch = trimmed.match(/^!(\d+)$/);
    if (histMatch) {
      const n = Number(histMatch[1]);
      const prior = this.history[n - 1];
      if (!prior) {
        return { stdout: "", stderr: `history: !${n}: no such event\n`, exitCode: 1 };
      }
      return this.executeLine(prior);
    }
    if (trimmed.includes("|")) {
      return this.execPipe(trimmed);
    }
    const parts = parseArgs(trimmed);
    return this.exec(parts[0] ?? "", parts.slice(1));
  }

  async close(): Promise<void> {
    await this.web.close();
  }

  private async dispatch(command: string, args: string[]): Promise<string> {
    switch (command) {
      case "help":
        return helpText();
      case "clear":
        return "\x1b[2J\x1b[H";
      case "tabs":
        return this.cmdTabs();
      case "windows":
        return this.cmdWindows();
      case "here":
        return this.cmdHere();
      case "navigate":
      case "goto":
        return this.cmdNavigate(required(args[0], "navigate <url>"));
      case "open":
        return this.cmdOpen(required(args[0], "open <url>"));
      case "back":
        return this.cmdWrite(async () => { await this.backend.back(); await this.refreshAx(); return "Went back\n"; });
      case "forward":
        return this.cmdWrite(async () => { await this.backend.forward(); await this.refreshAx(); return "Went forward\n"; });
      case "close":
        return this.cmdWrite(async () => {
          await this.backend.closeTab(args[0] ? Number(args[0]) : undefined);
          if (this.state.mode === "tab") this.state.mode = "browser";
          await this.refreshAx();
          return "Closed tab\n";
        });
      case "ls":
        return this.cmdLs(parseLsOptions(args));
      case "cd":
        return this.cmdCd(required(args[0], "cd <path>"));
      case "pwd":
        return this.cmdPwd();
      case "tree":
        return this.cmdTree(Number(args[0]) || 2);
      case "refresh":
        return this.cmdRefresh();
      case "cat":
        return this.cmdCat(args);
      case "text":
        return this.cmdText(args);
      case "read":
        return this.cmdRead(args);
      case "grep":
        return this.cmdGrep(args);
      case "find":
        return this.cmdFind(args);
      case "extract_links":
        return this.cmdExtractLinks(args);
      case "extract_table":
        return this.cmdExtractTable(args);
      case "click":
        return this.cmdClick(required(args[0], "click <name>"));
      case "focus":
        return this.cmdWrite(async () => {
          await this.backend.focusAx(required(args[0], "focus <name>"));
          return `Focused ${args[0]}\n`;
        });
      case "type":
        return this.cmdType(args);
      case "submit":
        return this.cmdSubmit(args);
      case "scroll":
        return this.cmdScroll(args);
      case "select":
        return this.cmdWrite(async () => {
          await this.backend.selectAx(required(args[0], "select <name> <value>"), required(args[1], "select <name> <value>"));
          await this.afterWrite();
          return `Selected ${args[1]} on ${args[0]}\n`;
        });
      case "wait":
        return this.cmdWait(args);
      case "js":
        return this.cmdJs(required(args.join(" "), "js <expression>"), true);
      case "eval":
        return this.cmdJs(required(args.join(" "), "eval <expression>"), false);
      case "screenshot":
        return this.cmdScreenshot();
      case "diff":
        return this.cmdDiff(args.includes("--json"));
      case "whoami":
        return this.cmdWhoami();
      case "env":
        return [...this.env.entries()].map(([k, v]) => `${k}=${v}`).join("\n") + "\n";
      case "export": {
        const eq = args[0]?.indexOf("=");
        if (eq && eq > 0) {
          this.env.set(args[0]!.slice(0, eq), args[0]!.slice(eq + 1));
          return "";
        }
        throw new Error("export KEY=VALUE");
      }
      case "history":
        if (args[0] === "clear") {
          this.history.length = 0;
          return "History cleared\n";
        }
        const n = args[0] === "-n" ? Number(args[1]) : Number(args[0]) || this.history.length;
        return this.history.slice(-n).map((h, i) => `${i + 1}  ${h}`).join("\n") + "\n";
      case "bookmark":
        return this.cmdBookmark(args);
      case "debug":
        return this.cmdDebug(args);
      case "watch":
        return this.cmdWatch(args);
      case "for":
        return this.cmdFor(args);
      case "each":
        return this.cmdEach(args);
      case "script":
        return this.cmdScript(args);
      case "functions":
        return this.cmdFunctions(args);
      case "call":
        return this.cmdCall(args);
      case "web":
        return this.web.handle(args);
      default:
        throw new Error(`Unknown command: ${command}. Type 'help' for commands.`);
    }
  }

  private async cmdTabs(): Promise<string> {
    const tabs = await this.backend.listTabs();
    const lines = ["ID     TITLE                         URL"];
    for (const t of tabs) {
      lines.push(`${String(t.id).padEnd(6)} ${t.title.slice(0, 28).padEnd(28)} ${t.url}`);
    }
    return lines.join("\n") + "\n";
  }

  private async cmdWindows(): Promise<string> {
    const wins = await this.backend.listWindows();
    const lines: string[] = [];
    for (const w of wins) {
      lines.push(`Window ${w.id}${w.focused ? " (focused)" : ""}`);
      for (const t of w.tabs) {
        lines.push(`  ${t.active ? "*" : " "}${t.id}   ${t.title}   ${t.url}`);
      }
    }
    return lines.join("\n") + "\n";
  }

  private async cmdHere(): Promise<string> {
    const tab = await this.backend.getActiveTab();
    this.state.mode = "tab";
    this.state.tabId = tab.id;
    this.state.axCwd = "";
    await this.refreshAx();
    if (this.options.config.autoSnapshotOnWrite && tab.url.startsWith("http")) {
      await this.web.handle(["open", tab.url]).catch(() => {});
    }
    return `Entered tab ${tab.id}\n  Title: ${tab.title}\n  URL:   ${tab.url}\n  AX Nodes: ${this.axFs?.nodeCount ?? 0}\n`;
  }

  private async cmdNavigate(url: string): Promise<string> {
    return this.cmdWrite(async () => {
      this.savePreAction();
      await this.backend.navigate(url);
      await this.refreshAx();
      const tab = await this.backend.getActiveTab();
      return `Navigated to ${tab.url}\n`;
    });
  }

  private async cmdOpen(url: string): Promise<string> {
    return this.cmdWrite(async () => {
      this.savePreAction();
      const tab = await this.backend.openTab(url);
      this.state.mode = "tab";
      this.state.tabId = tab.id;
      this.state.axCwd = "";
      await this.refreshAx();
      if (this.options.config.autoSnapshotOnWrite) {
        await this.web.handle(["open", url]).catch(() => {});
      }
      return `Opened tab ${tab.id}\n  URL: ${tab.url}\n  AX Nodes: ${this.axFs?.nodeCount ?? 0}\n`;
    });
  }

  private async cmdCd(path: string): Promise<string> {
    if (path === "~" || path === "/") {
      this.state.mode = "browser";
      this.state.tabId = undefined;
      this.state.axCwd = "";
      return "At browser root (~)\n";
    }
    if (path.startsWith("@")) {
      const name = path.slice(1);
      const bookmarked = this.bookmarks.get(name);
      if (!bookmarked) throw new Error(`Unknown bookmark: ${name}`);
      return this.cmdCd(bookmarked);
    }
    const winMatch = path.match(/^\/?windows\/(\d+)/) ?? path.match(/^windows\/(\d+)/);
    if (winMatch) {
      const wins = await this.backend.listWindows();
      const win = wins.find((w) => w.id === Number(winMatch[1]));
      if (!win) throw new Error(`No such window: ${winMatch[1]}`);
      const tab = win.tabs.find((t) => t.active) ?? win.tabs[0];
      if (!tab) throw new Error(`Window ${win.id} has no tabs`);
      const active = await this.backend.switchTab(tab.id);
      this.state.mode = "tab";
      this.state.tabId = active.id;
      this.state.axCwd = "";
      await this.refreshAx();
      return `Entered window ${win.id}, tab ${active.id}\n`;
    }
    const tabPathMatch = path.match(/^\/?tabs\/(.+)/) ?? path.match(/^tabs\/(.+)/);
    if (tabPathMatch) {
      const needle = tabPathMatch[1]!;
      const tabs = await this.backend.listTabs();
      const byId = Number(needle);
      let tab = !Number.isNaN(byId) ? tabs.find((t) => t.id === byId) : undefined;
      if (!tab) {
        const lower = needle.toLowerCase();
        tab = tabs.find(
          (t) => t.title.toLowerCase().includes(lower) || t.url.toLowerCase().includes(lower)
        );
      }
      if (!tab) throw new Error(`No tab matching: ${needle}`);
      const active = await this.backend.switchTab(tab.id);
      this.state.mode = "tab";
      this.state.tabId = active.id;
      this.state.axCwd = "";
      await this.refreshAx();
      return `Entered tab ${active.id}\n  Title: ${active.title}\n`;
    }
    if (this.state.mode !== "tab") throw new Error("Enter a tab first with 'here' or 'cd tabs/<id>'");
    await this.ensureAx();
    const entry = resolvePath(this.axFs!, path, this.state.axCwd);
    if (!entry) throw new Error(`No such path: ${path}`);
    if (!entry.isDirectory && path !== "..") {
      throw new Error(`${path} is not a directory`);
    }
    this.state.axCwd = entry.path === "/" ? "" : normalizePath(entry.path);
    return `cd ${this.state.axCwd}\n`;
  }

  private cmdPwd(): string {
    if (this.state.mode === "browser") return "~/\n";
    const tab = this.state.tabId ?? "?";
    const ax = this.state.axCwd ? `/${this.state.axCwd}` : "";
    return `~/tabs/${tab}${ax}\n`;
  }

  private async cmdLs(opts: ListOptions & { paths: string[] }): Promise<string> {
    if (this.state.mode === "browser") return this.cmdTabs();
    await this.ensureAx();
    const base = resolvePath(this.axFs!, opts.paths[0] ?? ".", this.state.axCwd) ?? this.axFs!.root;
    const items = listChildren(base, opts);
    if (opts.count) return `${items.length}\n`;
    if (opts.json) return JSON.stringify(items.map(formatEntry), null, 2) + "\n";
    return items.map((e) => formatLsLine(e, opts)).join("\n") + "\n";
  }

  getScreenshotPath(): string {
    return resolve(this.options.sessionRoot, "site", "screenshot-live.png");
  }

  private async cmdTree(depth: number): Promise<string> {
    await this.ensureAx();
    const base = resolvePath(this.axFs!, ".", this.state.axCwd) ?? this.axFs!.root;
    return renderTree(base, depth, 0) + "\n";
  }

  private async cmdRefresh(): Promise<string> {
    await this.refreshAx();
    return `Refreshed AX tree (${this.axFs?.nodeCount ?? 0} nodes)\n`;
  }

  private async cmdCat(args: string[]): Promise<string> {
    await this.ensureAx();
    const json = args.includes("--json");
    const name = args.find((a) => !a.startsWith("--")) ?? ".";
    const entry = resolvePath(this.axFs!, name, this.state.axCwd);
    if (!entry) throw new Error(`No such element: ${name}`);
    const meta = formatEntry(entry);
    return json ? JSON.stringify(meta, null, 2) + "\n" : JSON.stringify(meta, null, 2) + "\n";
  }

  private async cmdText(args: string[]): Promise<string> {
    await this.ensureAx();
    const links = args.includes("--links");
    const limit = flagValue(args, "-n", 50);
    const name = args.find((a) => !a.startsWith("-") && a !== String(limit)) ?? ".";
    const entry = resolvePath(this.axFs!, name, this.state.axCwd) ?? this.axFs!.root;
    const chunks: string[] = [];
    const walk = (e: typeof entry, n: number) => {
      if (chunks.length >= (limit ?? 50)) return;
      if (e.name) {
        chunks.push(links && e.role === "link" && e.value ? `[${e.name}](${e.value})` : e.name);
      }
      for (const c of e.children) walk(c, n + 1);
    };
    walk(entry, 0);
    return chunks.join("\n") + "\n";
  }

  private async cmdRead(args: string[]): Promise<string> {
    const depth = flagValue(args, "-d", 2) ?? 2;
    const meta = args.includes("--meta");
    const text = args.includes("--text");
    await this.ensureAx();
    const name = args.find((a) => !a.startsWith("-")) ?? ".";
    const entry = resolvePath(this.axFs!, name, this.state.axCwd) ?? this.axFs!.root;
    const lines: string[] = [entry.path];
    if (meta) lines.push(JSON.stringify(formatEntry(entry)));
    if (text || !meta) lines.push(await this.cmdText([name, "-n", "20"]));
    if (depth > 1) lines.push(renderTree(entry, depth, 0));
    return lines.join("\n") + "\n";
  }

  private async cmdGrep(args: string[]): Promise<string> {
    await this.ensureAx();
    const opts = {
      pattern: "",
      recursive: args.includes("-r"),
      content: args.includes("--content"),
      limit: flagValue(args, "-n", 50) ?? 50
    };
    const patternIdx = args.findIndex((a) => !a.startsWith("-"));
    opts.pattern = args[patternIdx] ?? "";
    if (!opts.pattern) throw new Error("grep <pattern>");
    const hits = grepEntries(this.axFs!, this.state.axCwd, opts);
    return hits.map((h) => `${h.path}\t${h.segment}\t${h.role}`).join("\n") + "\n";
  }

  private async cmdFind(args: string[]): Promise<string> {
    await this.ensureAx();
    const opts: FindOptions = { limit: flagValue(args, "-n", 50) ?? 50 };
    if (args.includes("--json")) opts.json = true;
    if (args.includes("--meta")) opts.meta = true;
    if (args.includes("--text")) opts.text = true;
    if (args.includes("--content")) opts.content = true;
    const typeIdx = args.indexOf("--type");
    if (typeIdx >= 0) opts.type = args[typeIdx + 1];
    const pattern = args.find((a) => !a.startsWith("--") && a !== opts.type);
    opts.pattern = pattern;
    const hits = findEntries(this.axFs!, this.state.axCwd, opts);
    if (opts.json) return JSON.stringify(hits.map(formatEntry), null, 2) + "\n";
    return hits.map((h) => formatFindLine(h, opts)).join("\n") + "\n";
  }

  private async cmdExtractLinks(args: string[]): Promise<string> {
    await this.ensureAx();
    const name = args.find((a) => !a.startsWith("-")) ?? ".";
    const entry = resolvePath(this.axFs!, name, this.state.axCwd) ?? this.axFs!.root;
    const links = extractLinks(entry, flagValue(args, "-n", 100) ?? 100);
    return links.map((l) => `[${l.text}](${l.url})`).join("\n") + "\n";
  }

  private async cmdExtractTable(args: string[]): Promise<string> {
    await this.ensureAx();
    const formatIdx = args.indexOf("--format");
    const format = formatIdx >= 0 && args[formatIdx + 1] === "csv" ? "csv" : "md";
    const name = args.find((a) => !a.startsWith("--") && a !== "csv") ?? ".";
    const entry = resolvePath(this.axFs!, name, this.state.axCwd) ?? this.axFs!.root;
    return extractTable(entry, format);
  }

  private async cmdClick(name: string): Promise<string> {
    return this.cmdWrite(async () => {
      this.savePreAction();
      await this.backend.clickAx(name);
      await this.afterWrite();
      return `Clicked ${name}\n`;
    });
  }

  private async cmdType(args: string[]): Promise<string> {
    const text = args[args.length - 1] ?? "";
    const target = args.length > 1 ? args.slice(0, -1).join(" ") : undefined;
    return this.cmdWrite(async () => {
      await this.backend.typeAx(text, target);
      await this.afterWrite();
      return `Typed into ${target ?? "focused element"}\n`;
    });
  }

  private async cmdSubmit(args: string[]): Promise<string> {
    return this.cmdWrite(async () => {
      this.savePreAction();
      const fields: Array<{ target: string; value: string }> = [];
      let submit: string | undefined;
      for (let i = 0; i < args.length; i++) {
        if (args[i] === "--submit") submit = args[++i];
        else if (args[i]?.includes("=")) {
          const [t, v] = args[i]!.split("=");
          fields.push({ target: t!, value: v ?? "" });
        }
      }
      await this.backend.submitAx({ fields, submit });
      await this.afterWrite();
      return "Submitted form\n";
    });
  }

  private async cmdScroll(args: string[]): Promise<string> {
    return this.cmdWrite(async () => {
      const dir = args[0] === "up" || args[0] === "down" ? args[0] : args[0];
      const amount = dir === "up" || dir === "down" ? Number(args[1] ?? 1) : undefined;
      const msg = await this.backend.scrollAx(dir ?? "down", amount);
      await this.refreshAx();
      return `${msg}\n`;
    });
  }

  private async cmdWait(args: string[]): Promise<string> {
    const typeIdx = args.indexOf("--type");
    const timeoutIdx = args.indexOf("--timeout");
    await this.backend.waitAx({
      pattern: args.find((a) => !a.startsWith("--")),
      type: typeIdx >= 0 ? args[typeIdx + 1] : undefined,
      timeoutMs: timeoutIdx >= 0 ? Number(args[timeoutIdx + 1]) * 1000 : 5000
    });
    await this.refreshAx();
    return "Element ready\n";
  }

  private async cmdJs(expr: string, _write: boolean): Promise<string> {
    if (!this.options.allowWrite && _write) throw new Error("js requires --allow-write");
    const result = await this.backend.evaluateJs(expr, _write);
    return JSON.stringify(result, null, 2) + "\n";
  }

  private async cmdScreenshot(): Promise<string> {
    const buf = await this.backend.screenshotPng();
    const path = this.getScreenshotPath();
    await writeFile(path, buf);
    return `Screenshot saved to ${path}\n`;
  }

  private async cmdDiff(json: boolean): Promise<string> {
    if (!this.preActionFs || !this.axFs) return "No pre-action snapshot. Run an action first.\n";
    const changes = diffAxFilesystem(this.preActionFs, this.axFs);
    if (json) return JSON.stringify(changes, null, 2) + "\n";
    return changes.map((c) => `${c.change}\t${c.path}\t${c.before ?? ""} -> ${c.after ?? ""}`).join("\n") + "\n";
  }

  private async cmdWhoami(): Promise<string> {
    if (!this.options.allowSensitive) throw new Error("whoami requires --allow-sensitive");
    const cookies = await this.backend.getCookies();
    return cookies.map((c) => `${c.domain}\t${c.name}=***`).join("\n") + "\n";
  }

  private async cmdBookmark(args: string[]): Promise<string> {
    if (args[0] === "--delete") {
      this.bookmarks.delete(args[1] ?? "");
      return "Deleted bookmark\n";
    }
    if (args.length === 0) {
      return [...this.bookmarks.entries()].map(([k, v]) => `@${k} -> ${v}`).join("\n") + "\n";
    }
    const name = args[0]!;
    if (args.length === 1) {
      const path = this.bookmarks.get(name);
      if (!path) throw new Error(`Unknown bookmark: ${name}`);
      return this.cmdCd(path.startsWith("@") ? path.slice(1) : path);
    }
    this.bookmarks.set(name, this.state.axCwd);
    return `Bookmarked ${name} -> ${this.state.axCwd}\n`;
  }

  private async cmdDebug(args: string[]): Promise<string> {
    if (args[0] === "stats") {
      await this.ensureAx();
      return `nodes: ${this.axFs?.nodeCount}\npaths: ${this.axFs?.entriesByPath.size}\n`;
    }
    if (args[0] === "raw") {
      const raw = await this.backend.refreshAxTree();
      return JSON.stringify(raw, null, 2).slice(0, 8000) + "\n";
    }
    return "debug: stats | raw | node <path>\n";
  }

  private async cmdWatch(args: string[]): Promise<string> {
    const interval = Number(flagValue(args, "--interval", 1) ?? 1) * 1000;
    const times = Math.min(flagValue(args, "--times", 3) ?? 3, 10);
    const inner = args.filter((a) => !a.startsWith("--") && !["--interval", "--times", "--until-change"].includes(a)).join(" ");
    let prev = "";
    for (let i = 0; i < times; i++) {
      const result = await this.executeLine(inner);
      const out = result.stdout;
      if (args.includes("--until-change") && prev && out !== prev) break;
      prev = out;
      await sleep(interval);
    }
    return prev + "\n";
  }

  private async cmdFor(args: string[]): Promise<string> {
    const colon = args.indexOf(":");
    if (colon < 0) throw new Error('for "<cmd>" : <action>');
    const cmd = args.slice(0, colon).join(" ").replace(/^"|"$/g, "");
    const action = args.slice(colon + 1).join(" ");
    const result = await this.executeLine(cmd);
    const lines = result.stdout.split(/\r?\n/).filter(Boolean).slice(0, 50);
    const outputs: string[] = [];
    for (const line of lines) {
      const act = action.replace(/\{\}/g, line.trim());
      const r = await this.executeLine(act);
      outputs.push(r.stdout);
    }
    return outputs.join("\n");
  }

  private async cmdEach(args: string[]): Promise<string> {
    const patternIdx = args.indexOf("--pattern");
    const pattern = patternIdx >= 0 ? args[patternIdx + 1] : undefined;
    const cmdParts: string[] = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--pattern") {
        i++;
        continue;
      }
      if (!args[i]?.startsWith("--")) cmdParts.push(args[i]!);
    }
    const cmd = cmdParts.join(" ");
    let tabs = await this.backend.listTabs();
    if (pattern) {
      const re = new RegExp(pattern, "i");
      tabs = tabs.filter((t) => re.test(t.title) || re.test(t.url));
    }
    const active = tabs.find((t) => t.active)?.id;
    const outputs: string[] = [];
    for (const tab of tabs) {
      await this.backend.switchTab(tab.id);
      await this.refreshAx();
      const r = await this.executeLine(cmd);
      outputs.push(`=== tab ${tab.id} ===\n${r.stdout}`);
    }
    if (active) await this.backend.switchTab(active);
    return outputs.join("\n");
  }

  private async cmdScript(args: string[]): Promise<string> {
    await mkdir(this.scriptsDir, { recursive: true });
    const sub = args[0];
    if (sub === "list") {
      const files = await readdir(this.scriptsDir).catch(() => []);
      return files.join("\n") + "\n";
    }
    if (sub === "save" && args[1]) {
      const body = args.slice(2).join(" ");
      await writeFile(join(this.scriptsDir, `${args[1]}.sh`), body + "\n", "utf8");
      return `Saved script ${args[1]}\n`;
    }
    if (sub === "show" && args[1]) {
      return await readFile(join(this.scriptsDir, `${args[1]}.sh`), "utf8");
    }
    if (sub === "run" && args[1]) {
      let body = await readFile(join(this.scriptsDir, `${args[1]}.sh`), "utf8");
      args.slice(2).forEach((arg, i) => {
        body = body.replaceAll(`$${i + 1}`, arg);
      });
      const outputs: string[] = [];
      for (const line of body.split(/\r?\n/).filter(Boolean)) {
        const r = await this.executeLine(line);
        outputs.push(r.stdout);
      }
      return outputs.join("\n");
    }
    if (sub === "delete" && args[1]) {
      const { unlink } = await import("node:fs/promises");
      await unlink(join(this.scriptsDir, `${args[1]}.sh`));
      return `Deleted ${args[1]}\n`;
    }
    return "script list|save|show|run|delete\n";
  }

  private async cmdFunctions(args: string[]): Promise<string> {
    const pattern = args.find((a) => !a.startsWith("--"));
    const fns = await this.backend.listFunctions(pattern);
    if (args.includes("--json")) return JSON.stringify(fns, null, 2) + "\n";
    return fns.map((f) => `${f.name}(${f.arity})`).join("\n") + "\n";
  }

  private async cmdCall(args: string[]): Promise<string> {
    return this.cmdWrite(async () => {
      const name = required(args[0], "call <name>");
      const fnArgs = args.slice(1).map((a) => {
        try {
          return JSON.parse(a);
        } catch {
          return a;
        }
      });
      const result = await this.backend.callFunction(name, fnArgs);
      return JSON.stringify(result, null, 2) + "\n";
    });
  }

  private async cmdWrite(fn: () => Promise<string>): Promise<string> {
    if (this.options.allowWrite === false) throw new Error("Write commands disabled. Use --allow-write.");
    return fn();
  }

  private savePreAction(): void {
    if (this.axFs) this.preActionFs = this.axFs;
  }

  private async afterWrite(): Promise<void> {
    await this.refreshAx();
    if (this.options.config.autoSnapshotOnWrite) {
      await this.web.handle(["snapshot"]).catch(() => {});
    }
  }

  private async refreshAx(): Promise<void> {
    const raw = await this.backend.refreshAxTree();
    this.axFs = buildAxFilesystem(raw);
  }

  private async ensureAx(): Promise<void> {
    if (!this.axFs) await this.refreshAx();
  }

  private async audit(line: string): Promise<void> {
    await mkdir(resolve(this.options.sessionRoot), { recursive: true });
    await appendFile(this.auditPath, `[${new Date().toISOString()}] ${line}\n`, "utf8");
  }

  private async execPipe(line: string): Promise<ExecResult> {
    const [left, right] = line.split("|").map((s) => s.trim());
    const first = await this.executeLine(left!);
    const filtered = first.stdout.split(/\r?\n/).filter((l) => l.toLowerCase().includes(right!.toLowerCase()));
    return { stdout: filtered.join("\n") + "\n", stderr: "", exitCode: 0 };
  }
}

function parseLsOptions(args: string[]): ListOptions & { paths: string[] } {
  const opts: ListOptions & { paths: string[] } = { paths: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "-l") opts.long = true;
    else if (a === "--meta") opts.meta = true;
    else if (a === "--text") opts.text = true;
    else if (a === "-r") opts.recursive = true;
    else if (a === "--count") opts.count = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--after") opts.after = args[++i];
    else if (a === "--before") opts.before = args[++i];
    else if (a === "--textlen") opts.textlen = Number(args[++i]) || 40;
    else if (a.startsWith("--type=")) opts.type = a.split("=")[1];
    else if (a === "--type") opts.type = args[++i];
    else if (!a.startsWith("-")) opts.paths.push(a);
  }
  if (opts.text && opts.textlen === undefined) opts.textlen = 40;
  return opts;
}

function formatEntry(e: { path: string; segment: string; role: string; name: string; value?: string; isDirectory: boolean }) {
  return { path: e.path, segment: e.segment, role: e.role, name: e.name, value: e.value, directory: e.isDirectory };
}

function formatLsLine(e: AxEntry, opts: ListOptions): string {
  const prefix = e.isDirectory ? "[d]" : `[${e.role.slice(0, 1)}]`;
  let line = opts.long ? `${prefix} ${e.role.padEnd(12)} ${e.segment}` : e.segment;
  if (opts.meta && (e.value || e.description)) {
    line += `  [${e.role}] ${(e.value ?? e.description ?? "").slice(0, 80)}`;
  }
  if (opts.text) {
    const preview = (e.name || e.value || "").slice(0, opts.textlen ?? 40);
    if (preview) line += `  "${preview}"`;
  }
  return line;
}

function formatFindLine(e: AxEntry, opts: FindOptions): string {
  let line = `${e.path}\t[${e.role}]\t${e.segment}`;
  if (opts.meta && (e.value || e.description)) {
    line += `\t${(e.value ?? e.description ?? "").slice(0, 80)}`;
  }
  if (opts.text) {
    const preview = (e.name || e.value || "").slice(0, 40);
    if (preview) line += `\t"${preview}"`;
  }
  return line;
}

function renderTree(entry: AxEntry, maxDepth: number, depth: number): string {
  if (depth > maxDepth) return "";
  const indent = "  ".repeat(depth);
  const lines = [`${indent}${entry.segment || "/"}`];
  for (const child of entry.children) {
    lines.push(renderTree(child, maxDepth, depth + 1));
  }
  return lines.filter(Boolean).join("\n");
}

function parseArgs(line: string): string[] {
  const parts: string[] = [];
  let cur = "";
  let quote: string | null = null;
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (/\s/.test(ch)) {
      if (cur) {
        parts.push(cur);
        cur = "";
      }
    } else cur += ch;
  }
  if (cur) parts.push(cur);
  return parts;
}

function flagValue(args: string[], flag: string, fallback: number): number | undefined {
  const i = args.indexOf(flag);
  if (i < 0) return fallback;
  return Number(args[i + 1]) || fallback;
}

function required<T>(value: T | undefined, message: string): T {
  if (value === undefined || value === "") throw new Error(message);
  return value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function helpText(): string {
  return [
    "SiteFS shell — live AX commands + web QA",
    "",
    "Browser: tabs, windows, here, navigate, goto, open, back, forward, close",
    "DOM: ls, cd, pwd, tree, cat, text, read, grep, find, extract_links, click, focus, type, submit, scroll, select, wait, js, eval, screenshot, diff, refresh",
    "Automation: watch, for, each, script, functions, call",
    "System: whoami, env, export, history, bookmark, debug, help, clear",
    "QA: web help (open, check-all, report, crawl, diff-visual, flow, ...)",
    ""
  ].join("\n");
}
