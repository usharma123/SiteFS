import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { stringifyJson } from "./format.js";
import type { RunRegistryIndex, SiteRunRecord } from "./types/run.js";
import { originHashFromUrl } from "./url.js";

export type { SiteRunRecord, RunRegistryIndex } from "./types/run.js";

export function getRegistryDir(): string {
  const override = process.env.SITEFS_REGISTRY_DIR?.trim();
  if (override) return resolve(override);
  return join(homedir(), ".sitefs", "runs");
}

export async function loadRegistryIndex(registryDir = getRegistryDir()): Promise<RunRegistryIndex> {
  await mkdir(registryDir, { recursive: true });
  const indexPath = join(registryDir, "index.json");
  try {
    const raw = await readFile(indexPath, "utf8");
    const parsed = JSON.parse(raw) as RunRegistryIndex;
    return { origins: parsed.origins ?? {} };
  } catch {
    return { origins: {} };
  }
}

export async function saveRegistryIndex(index: RunRegistryIndex, registryDir = getRegistryDir()): Promise<void> {
  await mkdir(registryDir, { recursive: true });
  await writeFile(join(registryDir, "index.json"), stringifyJson(index), "utf8");
}

export async function registerRun(record: SiteRunRecord, registryDir = getRegistryDir()): Promise<SiteRunRecord | undefined> {
  const index = await loadRegistryIndex(registryDir);
  const originKey = originHashFromUrl(record.startUrl);
  const existing = index.origins[originKey] ?? [];
  const previous = existing[0];
  const next = [record, ...existing.filter((entry) => entry.runId !== record.runId)];
  index.origins[originKey] = next;
  await saveRegistryIndex(index, registryDir);
  return previous;
}

export async function getPreviousRun(startUrl: string, registryDir = getRegistryDir()): Promise<SiteRunRecord | undefined> {
  const index = await loadRegistryIndex(registryDir);
  const originKey = originHashFromUrl(startUrl);
  const runs = index.origins[originKey] ?? [];
  return runs[1];
}

export async function listRunsForOrigin(startUrl: string, registryDir = getRegistryDir()): Promise<SiteRunRecord[]> {
  const index = await loadRegistryIndex(registryDir);
  return index.origins[originHashFromUrl(startUrl)] ?? [];
}

export async function getRunById(runId: string, registryDir = getRegistryDir()): Promise<SiteRunRecord | undefined> {
  const index = await loadRegistryIndex(registryDir);
  for (const runs of Object.values(index.origins)) {
    const match = runs.find((run) => run.runId === runId);
    if (match) return match;
  }
  return undefined;
}
