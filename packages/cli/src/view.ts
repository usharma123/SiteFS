import { resolve } from "node:path";
import { finalizeViewerRun } from "@sitefs/sitefs";
import { finalizeAndOpenViewer, openViewer, shouldOpenViewer } from "./viewer-host.js";

export interface ViewOptions {
  sessionRoot: string;
  port: number;
  open: boolean;
  finalize: boolean;
  startUrl?: string;
  passed?: boolean;
}

export async function runView(options: ViewOptions): Promise<void> {
  const sessionRoot = resolve(options.sessionRoot);

  if (options.finalize) {
    await finalizeViewerRun({
      sessionRoot,
      startUrl: options.startUrl ?? "about:blank",
      startedAt: new Date().toISOString(),
      passed: options.passed
    });
  }

  const url = openViewer(sessionRoot, options.port, options.open && shouldOpenViewer());
  process.stdout.write(`Viewer URL: ${url}\n`);
}
