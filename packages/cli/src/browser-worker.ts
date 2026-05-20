import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { PlaywrightBrowserBackend } from "@sitefs/browser";
import type { WaitUntil } from "@sitefs/browser";

function parseArgs(argv: string[]) {
  const headed = argv.includes("--headed");
  const waitUntilArg = argv.find((arg) => arg.startsWith("--wait-until="));
  const networkIdleArg = argv.find((arg) => arg.startsWith("--network-idle-ms="));
  const userDataDirArg = argv.find((arg) => arg.startsWith("--user-data-dir="));
  const waitUntil = (waitUntilArg?.split("=")[1] ?? "networkidle") as WaitUntil;
  const networkIdleTimeoutMs = Number(networkIdleArg?.split("=")[1] ?? 3000);
  const userDataDir = userDataDirArg?.split("=").slice(1).join("=") || undefined;
  return { headed, waitUntil, networkIdleTimeoutMs, userDataDir };
}

const options = parseArgs(process.argv.slice(2));
const backend = new PlaywrightBrowserBackend({
  headed: options.headed,
  waitUntil: options.waitUntil,
  networkIdleTimeoutMs: options.networkIdleTimeoutMs,
  userDataDir: options.userDataDir
});
const rl = readline.createInterface({ input, output });

for await (const line of rl) {
  if (!line.trim()) continue;
  const message = JSON.parse(line) as { id: number; method: string; params: unknown[] };
  try {
    const result = await dispatch(message.method, message.params);
    output.write(`${JSON.stringify({ id: message.id, ok: true, result })}\n`);
  } catch (error) {
    output.write(
      `${JSON.stringify({ id: message.id, ok: false, error: error instanceof Error ? error.message : String(error) })}\n`
    );
  }
}

async function dispatch(method: string, params: unknown[]): Promise<unknown> {
  switch (method) {
    case "open":
      return backend.open(String(params[0]), (params[1] as { waitForSelector?: string }) ?? {});
    case "navigate":
      return backend.navigate(String(params[0]));
    case "click":
    case "clickAx":
      return backend.clickAx(String(params[0]));
    case "focusAx":
      return backend.focusAx(String(params[0]));
    case "type":
      return backend.type(String(params[0]), String(params[1]));
    case "typeAx":
      return backend.typeAx(String(params[0]), params[1] as string | undefined);
    case "submitAx":
      return backend.submitAx(params[0] as Parameters<typeof backend.submitAx>[0]);
    case "selectAx":
      return backend.selectAx(String(params[0]), String(params[1]));
    case "scroll":
      return backend.scroll(params[0] === "up" ? "up" : "down");
    case "scrollAx":
      return backend.scrollAx(String(params[0]), params[1] as number | undefined);
    case "wait":
      return backend.wait(Number(params[0]));
    case "waitAx":
      return backend.waitAx((params[0] ?? {}) as Parameters<typeof backend.waitAx>[0]);
    case "back":
      return backend.back();
    case "forward":
      return backend.forward();
    case "listTabs":
      return backend.listTabs();
    case "listWindows":
      return backend.listWindows();
    case "switchTab":
      return backend.switchTab(Number(params[0]));
    case "openTab":
      return backend.openTab(String(params[0]));
    case "closeTab":
      return backend.closeTab(params[0] as number | undefined);
    case "getActiveTab":
      return backend.getActiveTab();
    case "refreshAxTree":
      return backend.refreshAxTree();
    case "evaluateJs":
      return backend.evaluateJs(String(params[0]), params[1] as boolean | undefined);
    case "listFunctions":
      return backend.listFunctions(params[0] as string | undefined);
    case "callFunction":
      return backend.callFunction(String(params[0]), (params[1] as unknown[]) ?? []);
    case "screenshotPng": {
      const buf = await backend.screenshotPng();
      return { base64: buf.toString("base64") };
    }
    case "getCookies":
      return backend.getCookies();
    case "snapshot": {
      const snapshot = await backend.snapshot();
      const screenshotBase64 = snapshot.screenshotBuffer
        ? Buffer.from(snapshot.screenshotBuffer).toString("base64")
        : undefined;
      return { ...snapshot, screenshotBuffer: undefined, screenshotBase64 };
    }
    case "probeLink":
      return backend.probeLink(String(params[0]));
    case "close":
      return backend.close();
    default:
      throw new Error(`Unknown browser worker method: ${method}`);
  }
}
