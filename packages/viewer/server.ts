import { spawn } from "node:child_process";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";
import { sitefsApiPlugin } from "./vite.config.js";

const sessionRoot = process.env.SITEFS_SESSION_ROOT;
if (!sessionRoot) {
  console.error("SITEFS_SESSION_ROOT is required");
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const viewerRoot = basename(here) === "dist" ? join(here, "..") : here;
const port = Number(process.env.SITEFS_VIEWER_PORT ?? 4173);

const server = await createServer({
  configFile: false,
  root: viewerRoot,
  plugins: [react(), sitefsApiPlugin(sessionRoot)],
  server: {
    port,
    strictPort: false
  }
});

await server.listen(port);
const url = `http://localhost:${port}`;
console.log(`SiteFS viewer running at ${url}`);

if (process.env.SITEFS_NO_OPEN !== "1") {
  openBrowser(url);
}

function openBrowser(target: string): void {
  const platform = process.platform;
  const command = platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
  const child = spawn(command, platform === "win32" ? ["", target] : [target], {
    stdio: "ignore",
    detached: true,
    shell: platform === "win32"
  });
  child.unref();
}
