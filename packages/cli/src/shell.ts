import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Bash, defineCommand, InMemoryFs, MountableFs, ReadWriteFs } from "just-bash";
import { loadSessionConfig, LocalSiteFSStore } from "@sitefs/sitefs";
import { BrowserHost } from "./browser-host.js";
import { WebRuntime } from "./runtime.js";
import { WorkerBrowserBackend } from "./worker-backend.js";

export interface ShellOptions {
  sessionRoot: string;
  headed: boolean;
  commands?: string[];
  allowWrite?: boolean;
  allowSensitive?: boolean;
}

const LIVE_COMMANDS = [
  "tabs",
  "windows",
  "here",
  "navigate",
  "goto",
  "open",
  "back",
  "forward",
  "close",
  "ls",
  "cd",
  "pwd",
  "tree",
  "refresh",
  "cat",
  "text",
  "read",
  "grep",
  "find",
  "extract_links",
  "extract_table",
  "click",
  "focus",
  "type",
  "submit",
  "scroll",
  "select",
  "wait",
  "js",
  "eval",
  "screenshot",
  "diff",
  "watch",
  "for",
  "each",
  "script",
  "functions",
  "call",
  "whoami",
  "env",
  "export",
  "history",
  "bookmark",
  "debug",
  "help",
  "clear",
  "web"
] as const;

export async function runShell(options: ShellOptions): Promise<void> {
  const sessionRoot = resolve(options.sessionRoot);
  const siteRoot = resolve(sessionRoot, "site");
  await mkdir(siteRoot, { recursive: true });

  const store = new LocalSiteFSStore(siteRoot);
  await store.init();

  const config = await loadSessionConfig(sessionRoot);
  const backend = new WorkerBrowserBackend({
    headed: options.headed,
    waitUntil: config.waitUntil,
    networkIdleTimeoutMs: config.networkIdleTimeoutMs,
    userDataDir: config.userDataDir
  });
  const web = new WebRuntime(backend, store, { config, sessionRoot, openViewerOnCheckAll: true });
  const host = new BrowserHost(backend, store, web, {
    sessionRoot,
    config,
    allowWrite: options.allowWrite ?? config.allowWrite,
    allowSensitive: options.allowSensitive ?? config.allowSensitive
  });

  const customCommands = LIVE_COMMANDS.map((name) =>
    defineCommand(name, async (args) => {
      const result = await host.exec(name, args);
      return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode };
    })
  );

  const fs = new MountableFs({
    base: new InMemoryFs(),
    mounts: [
      { mountPoint: "/site", filesystem: new ReadWriteFs({ root: siteRoot, maxFileReadSize: 50 * 1024 * 1024 }) }
    ]
  });
  const bash = new Bash({ fs, cwd: "/site", customCommands });

  const runLine = async (line: string): Promise<void> => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    if (trimmed === "exit" || trimmed === "quit") return;
    const first = trimmed.split(/\s+/)[0] ?? "";
    const useHost =
      (LIVE_COMMANDS as readonly string[]).includes(first) ||
      first === "web" ||
      trimmed.includes("|") ||
      /^!\d+$/.test(trimmed);
    const result = useHost
      ? await host.executeLine(trimmed)
      : await bash.exec(trimmed, { cwd: "/site" });
    if (result.stdout) output.write(result.stdout);
    if (result.stderr) output.write(result.stderr);
  };

  if (options.commands?.length) {
    for (const command of options.commands) await runLine(command);
    await host.close();
    return;
  }

  if (!input.isTTY) {
    const lines = await readAllStdin();
    for (const line of lines.split(/\r?\n/).filter(Boolean)) await runLine(line);
    await host.close();
    return;
  }

  output.write(
    "SiteFS shell — live AX commands (ls, cd, click, tabs) + web QA (web help). Type help or web help.\n"
  );
  const rl = readline.createInterface({ input, output, prompt: "sitefs$ " });
  rl.prompt();
  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed === "exit" || trimmed === "quit") break;
    if (trimmed) await runLine(trimmed);
    rl.prompt();
  }
  rl.close();
  await host.close();
}

async function readAllStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of input) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}
