import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { stringifyJson } from "./format.js";

export interface SiteRunRecord {
  runId: string;
  origin: string;
  sessionRoot: string;
  siteRoot: string;
  startedAt: string;
  finishedAt: string;
  startUrl: string;
  passed?: boolean;
  pageCount: number;
  historyRange?: [string, string];
}

export interface RunRegistryIndex {
  origins: Record<string, SiteRunRecord[]>;
}

export function getRegistryDir(): string {
  const override = process.env.SITEFS_REGISTRY_DIR?.trim();
  if (override) return resolve(override);
  return join(homedir(), ".sitefs", "runs");
}

export function originHashFromUrl(url: string): string {
  return normalizeOrigin(url);
}

export function normalizeOrigin(url: string): string {
  const parsed = new URL(url);
  return parsed.origin.toLowerCase();
}

export function normalizePageUrl(url: string): string {
  const parsed = new URL(url);
  parsed.hash = "";
  const href = parsed.href.replace(/\/$/, "") || parsed.origin;
  return href;
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
