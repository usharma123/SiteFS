import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ButtonInfo, InputInfo, LinkInfo, PageSnapshot } from "./types.js";

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function readTextFile(path: string): Promise<string> {
  return readFile(path, "utf8");
}

export async function readJsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

export async function readJsonFileOptional<T>(path: string): Promise<T | null> {
  try {
    return await readJsonFile<T>(path);
  } catch {
    return null;
  }
}

/** Build a PageSnapshot from an on-disk snapshot directory (partial read for diffs). */
export async function readSnapshotFromDir(dir: string): Promise<PageSnapshot | null> {
  try {
    const [visibleText, links, buttons, inputs, screenshotSha256, url, title] = await Promise.all([
      readTextFile(join(dir, "visible_text.txt")),
      readJsonFile<LinkInfo[]>(join(dir, "links.json")),
      readJsonFile<ButtonInfo[]>(join(dir, "buttons.json")),
      readJsonFile<InputInfo[]>(join(dir, "inputs.json")),
      readTextFile(join(dir, "screenshot.sha256")).catch(() => ""),
      readTextFile(join(dir, "url.txt")),
      readTextFile(join(dir, "title.txt"))
    ]);
    return {
      id: "snapshot",
      url: url.trim(),
      title: title.trim(),
      visibleText,
      summary: "",
      accessibilityTree: null,
      dom: null,
      links,
      buttons,
      inputs,
      forms: [],
      consoleLogs: [],
      networkLogs: [],
      screenshotPath: join(dir, "screenshot.png"),
      timestamp: "",
      screenshotSha256: screenshotSha256.trim() || undefined
    };
  } catch {
    return null;
  }
}

export async function readConsoleLogFile(path: string): Promise<PageSnapshot["consoleLogs"]> {
  const text = await readFile(path, "utf8");
  return text.trim()
    ? text.trim().split(/\r?\n/).map((line) => ({
        type: line.includes("ERROR") ? "error" : "log",
        text: line,
        timestamp: ""
      }))
    : [];
}

export async function readYamlFile(path: string): Promise<unknown> {
  return readFile(path, "utf8");
}
