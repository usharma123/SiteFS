import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { PlaywrightBrowserBackend } from "@sitefs/browser";

const backend = new PlaywrightBrowserBackend({ headed: process.argv.includes("--headed") });
const rl = readline.createInterface({ input, output });

for await (const line of rl) {
  if (!line.trim()) continue;
  const message = JSON.parse(line) as { id: number; method: string; params: unknown[] };
  try {
    const result = await dispatch(message.method, message.params);
    output.write(`${JSON.stringify({ id: message.id, ok: true, result })}\n`);
  } catch (error) {
    output.write(`${JSON.stringify({ id: message.id, ok: false, error: error instanceof Error ? error.message : String(error) })}\n`);
  }
}

async function dispatch(method: string, params: unknown[]): Promise<unknown> {
  switch (method) {
    case "open":
      return backend.open(String(params[0]));
    case "click":
      return backend.click(String(params[0]));
    case "type":
      return backend.type(String(params[0]), String(params[1]));
    case "scroll":
      return backend.scroll(params[0] === "up" ? "up" : "down");
    case "wait":
      return backend.wait(Number(params[0]));
    case "back":
      return backend.back();
    case "forward":
      return backend.forward();
    case "snapshot": {
      const snapshot = await backend.snapshot();
      const screenshotBase64 = snapshot.screenshotBuffer ? Buffer.from(snapshot.screenshotBuffer).toString("base64") : undefined;
      return { ...snapshot, screenshotBuffer: undefined, screenshotBase64 };
    }
    case "close":
      return backend.close();
    default:
      throw new Error(`Unknown browser worker method: ${method}`);
  }
}

