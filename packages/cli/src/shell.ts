import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Bash, defineCommand, InMemoryFs, MountableFs, ReadWriteFs } from "just-bash";
import { LocalSiteFSStore } from "@sitefs/sitefs";
import { WebRuntime } from "./runtime.js";
import { WorkerBrowserBackend } from "./worker-backend.js";

export interface ShellOptions {
  sessionRoot: string;
  headed: boolean;
  commands?: string[];
}

export async function runShell(options: ShellOptions): Promise<void> {
  const sessionRoot = resolve(options.sessionRoot);
  const siteRoot = resolve(sessionRoot, "site");
  await mkdir(siteRoot, { recursive: true });

  const store = new LocalSiteFSStore(siteRoot);
  await store.init();

  const backend = new WorkerBrowserBackend({ headed: options.headed });
  const runtime = new WebRuntime(backend, store);
  const webCommand = defineCommand("web", async (args) => ({
    stdout: await runtime.handle(args),
    stderr: "",
    exitCode: 0
  }));

  const fs = new MountableFs({
    base: new InMemoryFs(),
    mounts: [
      { mountPoint: "/site", filesystem: new ReadWriteFs({ root: siteRoot, maxFileReadSize: 50 * 1024 * 1024 }) }
    ]
  });
  const bash = new Bash({ fs, cwd: "/", customCommands: [webCommand] });

  const runLine = async (line: string): Promise<void> => {
    const result = await bash.exec(line, { cwd: "/" });
    if (result.stdout) output.write(result.stdout);
    if (result.stderr) output.write(result.stderr);
  };

  if (options.commands?.length) {
    for (const command of options.commands) await runLine(command);
    await runtime.close();
    return;
  }

  if (!input.isTTY) {
    const lines = await readAllStdin();
    for (const line of lines.split(/\r?\n/).filter(Boolean)) await runLine(line);
    await runtime.close();
    return;
  }

  output.write("SiteFS shell. Use `web help` for browser commands, `exit` to quit.\n");
  const rl = readline.createInterface({ input, output, prompt: "sitefs$ " });
  rl.prompt();
  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed === "exit" || trimmed === "quit") break;
    if (trimmed) await runLine(trimmed);
    rl.prompt();
  }
  rl.close();
  await runtime.close();
}

async function readAllStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of input) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}
