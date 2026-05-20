import { mkdir, readFile } from "node:fs/promises";
import { join, normalize, resolve, sep } from "node:path";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadSessionConfig, LocalSiteFSStore } from "@sitefs/sitefs";
import { BrowserHost } from "./browser-host.js";
import { registerLiveTools } from "./mcp-live-tools.js";
import { WebRuntime } from "./runtime.js";
import { WorkerBrowserBackend } from "./worker-backend.js";

export interface McpOptions {
  sessionRoot: string;
  headed: boolean;
  allowWrite?: boolean;
  allowSensitive?: boolean;
}

export async function runMcpServer(options: McpOptions): Promise<void> {
  const sessionRoot = resolve(options.sessionRoot);
  const siteRoot = resolve(sessionRoot, "site");
  await mkdir(siteRoot, { recursive: true });

  const store = new LocalSiteFSStore(siteRoot);
  await store.init();
  const config = await loadSessionConfig(sessionRoot);
  const backend = new WorkerBrowserBackend({
    headed: options.headed,
    waitUntil: config.waitUntil,
    networkIdleTimeoutMs: config.networkIdleTimeoutMs,
    userDataDir: config.userDataDir
  });
  const web = new WebRuntime(backend, store, { config, sessionRoot: options.sessionRoot, openViewerOnCheckAll: false });
  const host = new BrowserHost(backend, store, web, {
    sessionRoot,
    config,
    allowWrite: options.allowWrite ?? config.allowWrite,
    allowSensitive: options.allowSensitive ?? config.allowSensitive
  });
  const server = new McpServer({ name: "sitefs", version: "0.3.0" });

  registerLiveTools(server, host, web, store, backend, {
    allowWrite: options.allowWrite ?? config.allowWrite,
    allowSensitive: options.allowSensitive ?? config.allowSensitive
  });
  registerResources(server, siteRoot);
  registerPrompt(server);

  const cleanup = async () => {
    await host.close().catch(() => {});
  };
  process.once("SIGINT", () => cleanup().finally(() => process.exit(130)));
  process.once("SIGTERM", () => cleanup().finally(() => process.exit(143)));

  await server.connect(new StdioServerTransport());
}

function registerResources(server: McpServer, siteRoot: string): void {
  server.registerResource(
    "sitefs-current-visible-text",
    "sitefs:///current/visible_text.txt",
    { title: "Current visible text", description: "Visible text snapshot", mimeType: "text/plain" },
    async (uri) => resourceResult(uri.href, await readSiteFile(join(siteRoot, "current", "visible_text.txt")), "text/plain")
  );

  server.registerResource(
    "sitefs-file",
    new ResourceTemplate("sitefs:///{path*}", { list: undefined }),
    { title: "SiteFS file", description: "Read /site files" },
    async (uri, variables) => {
      const rawPath = Array.isArray(variables.path) ? variables.path.join("/") : variables.path;
      const filePath = safeJoin(siteRoot, rawPath ?? "");
      return resourceResult(uri.href, await readSiteFile(filePath), mimeTypeFor(filePath));
    }
  );
}

function registerPrompt(server: McpServer): void {
  server.registerPrompt(
    "sitefs_qa_agent",
    { title: "SiteFS QA agent", description: "Live AX + /site evidence QA" },
    () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "You are a QA browser agent using SiteFS.",
              "Live AX: sitefs_here, sitefs_ls, sitefs_cd, sitefs_click, sitefs_find, sitefs_text, or sitefs_execute.",
              "Evidence: sitefs_open / web snapshot, sitefs_read_site for /site/current/*, sitefs_site_diff, sitefs_crawl.",
              "sitefs_screenshot returns saved path plus inline PNG.",
              "End with sitefs_check_all or sitefs_report; read sitefs:///reports/qa-summary.json.",
              "Write actions need MCP server started with --allow-write."
            ].join("\n")
          }
        }
      ]
    })
  );
}

function resourceResult(uri: string, text: string, mimeType: string) {
  return { contents: [{ uri, mimeType, text }] };
}

async function readSiteFile(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return "No such SiteFS file yet.\n";
    }
    throw error;
  }
}

function safeJoin(root: string, path: string): string {
  const cleaned = normalize(path).replace(/^(\.\.(\/|\\|$))+/, "");
  const resolved = resolve(root, cleaned);
  const rootWithSep = root.endsWith(sep) ? root : `${root}${sep}`;
  if (resolved !== root && !resolved.startsWith(rootWithSep)) throw new Error(`Path escapes SiteFS root: ${path}`);
  return resolved;
}

function mimeTypeFor(path: string): string {
  if (path.endsWith(".json")) return "application/json";
  if (path.endsWith(".md")) return "text/markdown";
  return "text/plain";
}
