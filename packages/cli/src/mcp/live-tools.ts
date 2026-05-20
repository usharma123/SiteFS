import { readFile } from "node:fs/promises";
import { normalize, resolve, sep } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WorkerBrowserBackend } from "@sitefs/browser";
import type { LocalSiteFSStore } from "@sitefs/sitefs";
import type { BrowserHost } from "@sitefs/live";
import type { WebRuntime } from "@sitefs/session";
import { buildQAReport, renderMarkdownReport, runAllChecks } from "@sitefs/qa";

export interface McpSecurity {
  allowWrite: boolean;
  allowSensitive: boolean;
}

const flagSchema = {
  meta: z.boolean().optional(),
  text: z.boolean().optional(),
  content: z.boolean().optional(),
  json: z.boolean().optional(),
  recursive: z.boolean().optional(),
  links: z.boolean().optional(),
  after: z.string().optional(),
  before: z.string().optional(),
  textlen: z.number().optional(),
  depth: z.number().optional(),
  format: z.enum(["md", "csv"]).optional()
};

export function registerLiveTools(
  server: McpServer,
  host: BrowserHost,
  runtime: WebRuntime,
  store: LocalSiteFSStore,
  backend: WorkerBrowserBackend,
  security: McpSecurity
): void {
  const run = async (cmd: string, args: string[] = []) => {
    const result = await host.exec(cmd, args);
    if (result.exitCode !== 0) throw new Error(result.stderr || result.stdout);
    return result.stdout;
  };

  const readTool = (name: string, desc: string, cmd: string, schema: Record<string, z.ZodTypeAny> = {}) => {
    server.registerTool(
      name,
      { title: name, description: desc, inputSchema: schema },
      async (args) => textResult(await run(cmd, toolArgs(args)))
    );
  };

  const writeTool = (name: string, desc: string, cmd: string, schema: Record<string, z.ZodTypeAny>) => {
    server.registerTool(
      name,
      { title: name, description: desc, inputSchema: schema },
      async (args) => {
        if (!security.allowWrite) throw new Error(`${name} requires --allow-write`);
        return textResult(await run(cmd, toolArgs(args)));
      }
    );
  };

  readTool("sitefs_tabs", "List open tabs", "tabs");
  readTool("sitefs_here", "Enter active tab", "here");
  readTool("sitefs_ls", "List AX children", "ls", {
    path: z.string().optional(),
    ...flagSchema
  });
  readTool("sitefs_cd", "Change directory in AX or browser tree", "cd", { path: z.string() });
  readTool("sitefs_pwd", "Print logical path", "pwd");
  readTool("sitefs_cat", "Element metadata", "cat", { name: z.string().optional(), json: z.boolean().optional() });
  readTool("sitefs_text", "Bulk text extract", "text", {
    name: z.string().optional(),
    links: z.boolean().optional()
  });
  readTool("sitefs_read", "Structured subtree", "read", {
    name: z.string().optional(),
    meta: z.boolean().optional(),
    text: z.boolean().optional(),
    depth: z.number().optional()
  });
  readTool("sitefs_find", "Find elements", "find", {
    pattern: z.string().optional(),
    type: z.string().optional(),
    ...flagSchema
  });
  readTool("sitefs_grep", "Grep AX tree", "grep", {
    pattern: z.string(),
    ...flagSchema
  });
  readTool("sitefs_tree", "Tree view", "tree", { depth: z.number().optional() });
  readTool("sitefs_refresh", "Refresh AX tree", "refresh");
  readTool("sitefs_wait", "Wait for element", "wait", { pattern: z.string().optional(), type: z.string().optional() });
  readTool("sitefs_eval", "Eval JS read-only", "eval", { expression: z.string() });
  readTool("sitefs_diff", "Live AX diff", "diff", { json: z.boolean().optional() });
  readTool("sitefs_extract_links", "Extract links", "extract_links", { name: z.string().optional() });
  readTool("sitefs_extract_table", "Extract table as markdown or CSV", "extract_table", {
    path: z.string().optional(),
    format: z.enum(["md", "csv"]).optional()
  });
  readTool("sitefs_functions", "List page functions", "functions", { pattern: z.string().optional(), json: z.boolean().optional() });
  readTool("sitefs_watch", "Watch command", "watch", { command: z.string() });
  readTool("sitefs_for", "For loop", "for", { command: z.string(), action: z.string() });
  readTool("sitefs_script", "Script manager", "script", { sub: z.string(), name: z.string().optional() });
  readTool("sitefs_each", "Run on each tab", "each", {
    command: z.string(),
    pattern: z.string().optional()
  });

  server.registerTool(
    "sitefs_screenshot",
    {
      title: "Screenshot tab",
      description: "Capture PNG; saves to session and returns inline image",
      inputSchema: {}
    },
    async () => {
      const stdout = await run("screenshot");
      const filePath = host.getScreenshotPath();
      const buf = await readFile(filePath);
      return {
        content: [
          { type: "text" as const, text: stdout.trim() },
          {
            type: "image" as const,
            data: buf.toString("base64"),
            mimeType: "image/png"
          }
        ]
      };
    }
  );

  writeTool("sitefs_navigate", "Navigate current tab", "navigate", { url: z.string() });
  writeTool("sitefs_open", "Open URL in new tab", "open", { url: z.string() });
  writeTool("sitefs_click", "Click AX element", "click", { target: z.string() });
  writeTool("sitefs_focus", "Focus element", "focus", { target: z.string() });
  writeTool("sitefs_type", "Type text", "type", { text: z.string(), target: z.string().optional() });
  writeTool("sitefs_submit", "Submit form", "submit", { fields: z.string().optional() });
  writeTool("sitefs_scroll", "Scroll", "scroll", { direction: z.string().optional() });
  writeTool("sitefs_js", "Run JavaScript", "js", { expression: z.string() });
  writeTool("sitefs_back", "History back", "back", {});
  writeTool("sitefs_forward", "History forward", "forward", {});
  writeTool("sitefs_close", "Close tab", "close", { tabId: z.number().optional() });
  writeTool("sitefs_select", "Select dropdown", "select", { target: z.string(), value: z.string() });
  writeTool("sitefs_call", "Call page function", "call", { name: z.string() });

  server.registerTool(
    "sitefs_execute",
    {
      title: "Execute shell line",
      description: "Run any SiteFS shell command (live or web).",
      inputSchema: { line: z.string() }
    },
    async ({ line }) => {
      const result = await host.executeLine(line);
      if (result.exitCode !== 0) throw new Error(result.stderr || result.stdout);
      return textResult(result.stdout);
    }
  );

  server.registerTool(
    "sitefs_whoami",
    {
      title: "Cookie summary",
      description: "Requires --allow-sensitive",
      inputSchema: {}
    },
    async () => {
      if (!security.allowSensitive) throw new Error("sitefs_whoami requires --allow-sensitive");
      return textResult(await run("whoami"));
    }
  );

  server.registerTool(
    "sitefs_web",
    {
      title: "Run web QA command",
      description: "web open, check-all, report, crawl, diff-visual, flow, ...",
      inputSchema: {
        command: z.string(),
        args: z.array(z.string()).default([])
      }
    },
    async ({ command, args }) => textResult(await runtime.handle([command, ...args]))
  );

  server.registerTool(
    "sitefs_check_all",
    { title: "Run all QA checks", description: "Static + axe + links", inputSchema: {} },
    async () => textResult(await runtime.handle(["check-all"]))
  );

  server.registerTool(
    "sitefs_report",
    { title: "QA report", description: "Write qa-summary.md", inputSchema: {} },
    async () => textResult(await runtime.handle(["report"]))
  );

  server.registerTool(
    "sitefs_crawl",
    {
      title: "Crawl site",
      description: "BFS crawl",
      inputSchema: { url: z.string().optional(), maxPages: z.number().optional() }
    },
    async ({ url, maxPages }) => {
      const args = ["crawl", ...(url ? [url] : []), ...(maxPages ? [`--max-pages=${maxPages}`] : [])];
      return textResult(await runtime.handle(args));
    }
  );

  server.registerTool(
    "sitefs_read_site",
    {
      title: "Read /site file",
      description: "Read file under /site evidence tree",
      inputSchema: { path: z.string() }
    },
    async ({ path }) => {
      const cleaned = normalize(path.replace(/^\/?site\/?/, ""));
      const filePath = resolve(store.root, cleaned);
      if (!filePath.startsWith(store.root + sep)) throw new Error("Path escapes /site");
      return textResult(await readFile(filePath, "utf8"));
    }
  );

  server.registerTool(
    "sitefs_site_diff",
    {
      title: "Diff /site snapshots",
      description: "Evidence diff between snapshots",
      inputSchema: { latest: z.boolean().default(true) }
    },
    async ({ latest }) => textResult(await runtime.handle(latest ? ["diff", "latest"] : ["diff"]))
  );

  server.registerTool(
    "sitefs_summary",
    {
      title: "Session summary",
      description: "Compact QA + page summary",
      inputSchema: {}
    },
    async () => {
      const snapshot = await store.readSnapshot("current");
      const history = await store.listHistory();
      const issues = await runAllChecks(snapshot, (href) => backend.probeLink(href), {
        linkScope: "same-origin",
        failOnWarnings: false
      });
      const report = buildQAReport(snapshot, history, issues);
      return {
        content: [{ type: "text", text: renderMarkdownReport(report, snapshot) }],
        structuredContent: {
          url: snapshot.url,
          title: snapshot.title,
          passed: report.passed,
          issueCount: report.issues.length
        }
      };
    }
  );
}

function toolArgs(args: Record<string, unknown>): string[] {
  const out: string[] = [];
  const positionalKeys = new Set([
    "path",
    "name",
    "pattern",
    "target",
    "url",
    "expression",
    "text",
    "command",
    "direction",
    "type",
    "action",
    "sub",
    "fields"
  ]);

  for (const [k, v] of Object.entries(args)) {
    if (v === undefined || v === false) continue;
    if (k === "pattern" && typeof args.command === "string") {
      out.push("--pattern", String(v));
      continue;
    }
    if (positionalKeys.has(k)) {
      out.push(String(v));
      continue;
    }
    if (k === "depth" || k === "textlen" || k === "tabId") {
      out.push(String(v));
      continue;
    }
    if (k === "format") {
      out.push("--format", String(v));
      continue;
    }
    if (typeof v === "boolean" && v) {
      out.push(`--${k}`);
    }
  }
  return out;
}

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}
