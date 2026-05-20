import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { finalizeViewerRun } from "@sitefs/sitefs";

const require = createRequire(import.meta.url);

export interface OpenViewerOptions {
  sessionRoot: string;
  startUrl?: string;
  startedAt?: string;
  passed?: boolean;
  port?: number;
  open?: boolean;
  finalize?: boolean;
}

export function shouldOpenViewer(): boolean {
  return process.env.SITEFS_NO_VIEWER !== "1";
}

export async function finalizeAndOpenViewer(options: OpenViewerOptions): Promise<string | undefined> {
  const sessionRoot = resolve(options.sessionRoot);
  const startedAt = options.startedAt ?? new Date().toISOString();

  if (options.finalize !== false) {
    await finalizeViewerRun({
      sessionRoot,
      startUrl: options.startUrl ?? "about:blank",
      startedAt,
      passed: options.passed
    });
  }

  if (options.open === false || !shouldOpenViewer()) {
    return undefined;
  }

  return openViewer(sessionRoot, options.port, options.open ?? true);
}

export function openViewer(sessionRoot: string, port = 4173, openBrowser = true): string {
  const viewerRoot = resolveViewerPackageRoot();
  const builtServer = join(viewerRoot, "dist/server.js");
  const serverEntry = existsSync(builtServer) ? builtServer : join(viewerRoot, "server.ts");
  const spawnArgs = existsSync(builtServer) ? [serverEntry] : ["--import", "tsx", serverEntry];
  const env = {
    ...process.env,
    SITEFS_SESSION_ROOT: resolve(sessionRoot),
    SITEFS_VIEWER_PORT: String(port),
    SITEFS_NO_OPEN: openBrowser ? "0" : "1"
  };

  const child = spawn("node", spawnArgs, {
    cwd: viewerRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true
  });

  child.stdout?.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr?.on("data", (chunk) => process.stderr.write(chunk));
  child.unref();

  const url = `http://localhost:${port}`;
  process.stdout.write(`SiteFS viewer starting at ${url}\n`);
  return url;
}

function resolveViewerPackageRoot(): string {
  try {
    const pkgPath = require.resolve("@sitefs/viewer/package.json");
    return dirname(pkgPath);
  } catch {
    const here = dirname(fileURLToPath(import.meta.url));
    return resolve(here, "../../viewer");
  }
}
