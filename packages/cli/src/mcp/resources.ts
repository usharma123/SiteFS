import { readFile } from "node:fs/promises";
import { join, normalize, resolve, sep } from "node:path";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerResources(server: McpServer, siteRoot: string): void {
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

export function safeJoin(root: string, path: string): string {
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
