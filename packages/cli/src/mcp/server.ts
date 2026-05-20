import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createSessionWiring } from "../bootstrap.js";
import { registerLiveTools } from "./live-tools.js";
import { registerPrompt } from "./prompts.js";
import { registerResources } from "./resources.js";

export interface McpOptions {
  sessionRoot: string;
  headed: boolean;
  allowWrite?: boolean;
  allowSensitive?: boolean;
}

export async function runMcpServer(options: McpOptions): Promise<void> {
  const { siteRoot, store, config, backend, web, host } = await createSessionWiring({
    sessionRoot: options.sessionRoot,
    headed: options.headed,
    allowWrite: options.allowWrite,
    allowSensitive: options.allowSensitive,
    openViewerOnCheckAll: false
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
