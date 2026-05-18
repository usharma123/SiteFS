import { mkdir, readFile, readdir } from "node:fs/promises";
import { join, normalize, resolve, sep } from "node:path";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { checkBrokenLinks, checkConsoleErrors, renderMarkdownReport, buildQAReport } from "@sitefs/qa";
import { LocalSiteFSStore } from "@sitefs/sitefs";
import { WebRuntime } from "./runtime.js";
import { WorkerBrowserBackend } from "./worker-backend.js";

export interface McpOptions {
  sessionRoot: string;
  headed: boolean;
}

export async function runMcpServer(options: McpOptions): Promise<void> {
  const sessionRoot = resolve(options.sessionRoot);
  const siteRoot = resolve(sessionRoot, "site");
  await mkdir(siteRoot, { recursive: true });

  const store = new LocalSiteFSStore(siteRoot);
  await store.init();
  const backend = new WorkerBrowserBackend({ headed: options.headed });
  const runtime = new WebRuntime(backend, store);
  const server = new McpServer({ name: "sitefs", version: "0.1.0" });

  registerTools(server, runtime, store);
  registerResources(server, siteRoot);
  registerPrompt(server);

  const cleanup = async () => {
    await runtime.close().catch(() => {});
  };
  process.once("SIGINT", () => cleanup().finally(() => process.exit(130)));
  process.once("SIGTERM", () => cleanup().finally(() => process.exit(143)));

  await server.connect(new StdioServerTransport());
}

function registerTools(server: McpServer, runtime: WebRuntime, store: LocalSiteFSStore): void {
  server.registerTool(
    "sitefs_web",
    {
      title: "Run SiteFS web command",
      description: "Run a SiteFS web command such as open, click, type, diff, report, or check-console-errors.",
      inputSchema: {
        command: z.string().describe("The web subcommand, for example open, click, type, diff, report."),
        args: z.array(z.string()).default([]).describe("Arguments passed to the web subcommand.")
      }
    },
    async ({ command, args }) => textResult(await runtime.handle([command, ...args]))
  );

  server.registerTool(
    "sitefs_open",
    {
      title: "Open URL",
      description: "Open a URL and write /site/current plus a history snapshot.",
      inputSchema: { url: z.string().url() }
    },
    async ({ url }) => textResult(await runtime.handle(["open", url]))
  );

  server.registerTool(
    "sitefs_click",
    {
      title: "Click target",
      description: "Click visible text or a selector, then snapshot.",
      inputSchema: { target: z.string() }
    },
    async ({ target }) => textResult(await runtime.handle(["click", target]))
  );

  server.registerTool(
    "sitefs_type",
    {
      title: "Type into target",
      description: "Fill an input by label, placeholder, visible text, or selector, then snapshot.",
      inputSchema: {
        target: z.string(),
        value: z.string()
      }
    },
    async ({ target, value }) => textResult(await runtime.handle(["type", target, value]))
  );

  server.registerTool(
    "sitefs_read",
    {
      title: "Read SiteFS file",
      description: "Read a file under /site, for example /site/current/visible_text.txt.",
      inputSchema: { path: z.string() }
    },
    async ({ path }) => textResult(await readSiteFile(sitePath(store.root, path)))
  );

  server.registerTool(
    "sitefs_list",
    {
      title: "List SiteFS directory",
      description: "List a directory under /site.",
      inputSchema: { path: z.string().default("/site") }
    },
    async ({ path }) => textResult((await readdir(sitePath(store.root, path))).join("\n") + "\n")
  );

  server.registerTool(
    "sitefs_diff",
    {
      title: "Diff snapshots",
      description: "Diff two snapshots, or pass latest=true for the last two snapshots.",
      inputSchema: {
        before: z.string().optional(),
        after: z.string().optional(),
        latest: z.boolean().default(false)
      }
    },
    async ({ before, after, latest }) => textResult(await runtime.handle(latest ? ["diff", "latest"] : ["diff", before ?? "", after ?? ""]))
  );

  server.registerTool(
    "sitefs_report",
    {
      title: "Generate QA report",
      description: "Generate /site/reports/qa-summary.md from the current snapshot.",
      inputSchema: {}
    },
    async () => textResult(await runtime.handle(["report"]))
  );

  server.registerTool(
    "sitefs_check_console_errors",
    {
      title: "Check console errors",
      description: "Check current snapshot console errors and write /site/reports/console-errors.md.",
      inputSchema: {}
    },
    async () => textResult(await runtime.handle(["check-console-errors"]))
  );

  server.registerTool(
    "sitefs_check_broken_links",
    {
      title: "Check broken links",
      description: "HEAD-check visible HTTP links from the current snapshot.",
      inputSchema: {}
    },
    async () => textResult(await runtime.handle(["check-broken-links"]))
  );

  server.registerTool(
    "sitefs_summary",
    {
      title: "Summarize current state",
      description: "Return a compact structured summary of current page, history, and static QA issues.",
      inputSchema: {}
    },
    async () => {
      const snapshot = await store.readSnapshot("current");
      const history = await store.listHistory();
      const brokenLinks = await checkBrokenLinks(snapshot);
      const issues = [...checkConsoleErrors(snapshot), ...brokenLinks];
      const report = buildQAReport(snapshot, history, issues);
      const markdown = renderMarkdownReport(report, snapshot);
      return {
        content: [{ type: "text", text: markdown }],
        structuredContent: {
          url: snapshot.url,
          title: snapshot.title,
          history,
          issueCount: report.issues.length,
          buttons: snapshot.buttons.length,
          inputs: snapshot.inputs.length,
          forms: snapshot.forms.length,
          links: snapshot.links.length
        }
      };
    }
  );
}

function registerResources(server: McpServer, siteRoot: string): void {
  server.registerResource(
    "sitefs-current-visible-text",
    "sitefs:///current/visible_text.txt",
    {
      title: "Current visible text",
      description: "Visible text from the current SiteFS browser snapshot.",
      mimeType: "text/plain"
    },
    async (uri) => resourceResult(uri.href, await readSiteFile(join(siteRoot, "current", "visible_text.txt")), "text/plain")
  );

  server.registerResource(
    "sitefs-current-forms",
    "sitefs:///current/forms.json",
    {
      title: "Current forms",
      description: "Detected forms from the current SiteFS browser snapshot.",
      mimeType: "application/json"
    },
    async (uri) => resourceResult(uri.href, await readSiteFile(join(siteRoot, "current", "forms.json")), "application/json")
  );

  server.registerResource(
    "sitefs-current-buttons",
    "sitefs:///current/buttons.json",
    {
      title: "Current buttons",
      description: "Detected buttons from the current SiteFS browser snapshot.",
      mimeType: "application/json"
    },
    async (uri) => resourceResult(uri.href, await readSiteFile(join(siteRoot, "current", "buttons.json")), "application/json")
  );

  server.registerResource(
    "sitefs-file",
    new ResourceTemplate("sitefs:///{path*}", {
      list: async () => ({
        resources: [
          resourceMeta("sitefs:///current/visible_text.txt", "Current visible text", "text/plain"),
          resourceMeta("sitefs:///current/forms.json", "Current forms", "application/json"),
          resourceMeta("sitefs:///current/buttons.json", "Current buttons", "application/json"),
          resourceMeta("sitefs:///current/links.json", "Current links", "application/json"),
          resourceMeta("sitefs:///current/console.log", "Current console log", "text/plain"),
          resourceMeta("sitefs:///reports/qa-summary.md", "QA summary", "text/markdown"),
          resourceMeta("sitefs:///reports/journey.md", "Journey report", "text/markdown")
        ]
      })
    }),
    {
      title: "SiteFS file",
      description: "Read any file under /site through a sitefs:/// URI."
    },
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
    {
      title: "SiteFS QA agent",
      description: "Prompt for using SiteFS MCP tools as a QA browser agent."
    },
    () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "You are a QA browser agent using SiteFS.",
              "Use sitefs_open, sitefs_click, sitefs_type, and sitefs_web to interact with the browser.",
              "Use sitefs_read and sitefs:// resources to inspect /site/current files.",
              "Prefer filesystem evidence: visible_text.txt, forms.json, buttons.json, links.json, console.log, network.json.",
              "Diff snapshots after meaningful actions with sitefs_diff latest.",
              "Do not click destructive actions such as delete, purchase, pay, send, publish, deploy, transfer, invite user, change password, or delete account.",
              "End by calling sitefs_report and summarizing the report."
            ].join("\n")
          }
        }
      ]
    })
  );
}

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function resourceResult(uri: string, text: string, mimeType: string) {
  return {
    contents: [{ uri, mimeType, text }]
  };
}

function resourceMeta(uri: string, name: string, mimeType: string) {
  return { uri, name, mimeType };
}

async function readSiteFile(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return "No such SiteFS file yet. Open a page or create a snapshot first.\n";
    }
    throw error;
  }
}

function sitePath(siteRoot: string, path: string): string {
  const withoutSite = path.replace(/^\/?site\/?/, "");
  return safeJoin(siteRoot, withoutSite);
}

function safeJoin(root: string, path: string): string {
  const cleaned = normalize(path).replace(/^(\.\.(\/|\\|$))+/, "");
  const resolved = resolve(root, cleaned);
  const rootWithSep = root.endsWith(sep) ? root : `${root}${sep}`;
  if (resolved !== root && !resolved.startsWith(rootWithSep)) {
    throw new Error(`Path escapes SiteFS root: ${path}`);
  }
  return resolved;
}

function mimeTypeFor(path: string): string {
  if (path.endsWith(".json")) return "application/json";
  if (path.endsWith(".md")) return "text/markdown";
  if (path.endsWith(".yaml") || path.endsWith(".yml")) return "application/yaml";
  if (path.endsWith(".log") || path.endsWith(".txt")) return "text/plain";
  return "text/plain";
}

