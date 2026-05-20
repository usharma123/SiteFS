import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerPrompt(server: McpServer): void {
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
