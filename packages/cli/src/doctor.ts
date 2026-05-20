import { access, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { WorkerBrowserBackend } from "@sitefs/browser";

export interface DoctorOptions {
  sessionRoot: string;
}

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

export async function runDoctor(options: DoctorOptions): Promise<void> {
  const checks: Check[] = [];
  checks.push({
    name: "node",
    ok: true,
    detail: process.version
  });

  checks.push(await pathCheck("pnpm bootstrap", ".tools/pnpm/package/dist/pnpm.mjs"));
  checks.push(await pathCheck("dependencies", "node_modules"));

  const sessionRoot = resolve(options.sessionRoot);
  try {
    await mkdir(resolve(sessionRoot, "site"), { recursive: true });
    checks.push({ name: "session path", ok: true, detail: sessionRoot });
  } catch (error) {
    checks.push({ name: "session path", ok: false, detail: errorMessage(error) });
  }

  checks.push(await browserCheck());

  for (const check of checks) {
    process.stdout.write(`${check.ok ? "✓" : "✗"} ${check.name}: ${check.detail}\n`);
  }

  if (checks.some((check) => !check.ok)) {
    process.exitCode = 1;
  }
}

async function pathCheck(name: string, path: string): Promise<Check> {
  try {
    await access(resolve(path));
    return { name, ok: true, detail: path };
  } catch {
    return { name, ok: false, detail: `${path} not found` };
  }
}

async function browserCheck(): Promise<Check> {
  const backend = new WorkerBrowserBackend({ headed: false });
  try {
    await backend.open("data:text/html,%3Ctitle%3ESiteFS%20Doctor%3C/title%3E%3Cp%3Eok%3C/p%3E");
    const snapshot = await backend.snapshot();
    const ax = await backend.refreshAxTree();
    const axNodes = Array.isArray((ax as { nodes?: unknown[] })?.nodes) ? (ax as { nodes: unknown[] }).nodes.length : 0;
    const tabs = await backend.listTabs();
    await backend.close();
    const detail = `Chromium launched; snapshot title="${snapshot.title}", links=${snapshot.links.length}, buttons=${snapshot.buttons.length}, axNodes=${axNodes}, tabs=${tabs.length}`;
    return { name: "browser", ok: true, detail };
  } catch (error) {
    await backend.close().catch(() => {});
    const message = errorMessage(error);
    if (/Executable doesn't exist|Looks like Playwright was just installed/i.test(message)) {
      return {
        name: "browser",
        ok: false,
        detail: "Chromium missing. Run: node scripts/pnpm.mjs --filter @sitefs/browser exec playwright install chromium"
      };
    }
    return { name: "browser", ok: false, detail: message };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
