import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export type LinkScope = "same-origin" | "all";
export type WaitUntil = "domcontentloaded" | "load" | "networkidle";

export interface SessionConfig {
  autoCheckStatic: boolean;
  autoCheckFull: boolean;
  failOnWarnings: boolean;
  linkScope: LinkScope;
  crawlMaxPages: number;
  waitUntil: WaitUntil;
  networkIdleTimeoutMs: number;
  userDataDir?: string;
  autoSnapshotOnWrite: boolean;
  allowWrite: boolean;
  allowSensitive: boolean;
}

export const defaultSessionConfig: SessionConfig = {
  autoCheckStatic: false,
  autoCheckFull: false,
  failOnWarnings: false,
  linkScope: "same-origin",
  crawlMaxPages: 20,
  waitUntil: "networkidle",
  networkIdleTimeoutMs: 3000,
  autoSnapshotOnWrite: true,
  allowWrite: true,
  allowSensitive: false
};

export function configPath(sessionRoot: string): string {
  return resolve(sessionRoot, "config.json");
}

export async function loadSessionConfig(sessionRoot: string): Promise<SessionConfig> {
  try {
    const raw = await readFile(configPath(sessionRoot), "utf8");
    const parsed = JSON.parse(raw) as Partial<SessionConfig>;
    return { ...defaultSessionConfig, ...parsed };
  } catch {
    return { ...defaultSessionConfig };
  }
}

export async function saveSessionConfig(sessionRoot: string, config: SessionConfig): Promise<void> {
  const path = configPath(sessionRoot);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}
