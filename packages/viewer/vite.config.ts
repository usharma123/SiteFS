import { createReadStream, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, normalize, resolve } from "node:path";
import react from "@vitejs/plugin-react";
import type { Connect, Plugin } from "vite";
import { defineConfig } from "vite";

function sitefsApiPlugin(sessionRoot: string): Plugin {
  const siteRoot = resolve(sessionRoot, "site");

  const middleware: Connect.NextHandleFunction = async (req, res, next) => {
    if (!req.url?.startsWith("/api/")) return next();

    try {
      const requestUrl = new URL(req.url, "http://localhost");
      if (requestUrl.pathname === "/api/manifest") {
        const manifestPath = join(siteRoot, "viewer-manifest.json");
        const body = await readFile(manifestPath, "utf8");
        res.setHeader("Content-Type", "application/json");
        res.end(body);
        return;
      }

      if (requestUrl.pathname === "/api/asset") {
        const relativePath = requestUrl.searchParams.get("path");
        if (!relativePath) {
          res.statusCode = 400;
          res.end("Missing path");
          return;
        }
        const safePath = resolveSafeAsset(siteRoot, relativePath);
        if (!safePath || !existsSync(safePath)) {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }
        const ext = safePath.split(".").pop()?.toLowerCase();
        const contentType =
          ext === "png"
            ? "image/png"
            : ext === "json"
              ? "application/json"
              : ext === "md"
                ? "text/markdown; charset=utf-8"
                : "text/plain; charset=utf-8";
        res.setHeader("Content-Type", contentType);
        createReadStream(safePath).pipe(res);
        return;
      }

      res.statusCode = 404;
      res.end("Not found");
    } catch (error) {
      res.statusCode = 500;
      res.end(error instanceof Error ? error.message : String(error));
    }
  };

  return {
    name: "sitefs-api",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    }
  };
}

function resolveSafeAsset(siteRoot: string, relativePath: string): string | null {
  const normalized = normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const absolute = resolve(siteRoot, normalized);
  if (!absolute.startsWith(siteRoot)) return null;
  return absolute;
}

export default defineConfig(({ mode }) => {
  const sessionRoot = process.env.SITEFS_SESSION_ROOT ?? resolve(process.cwd(), ".sitefs");
  return {
    plugins: [react(), sitefsApiPlugin(sessionRoot)],
    server: {
      port: Number(process.env.SITEFS_VIEWER_PORT ?? 4173),
      strictPort: false
    },
    preview: {
      port: Number(process.env.SITEFS_VIEWER_PORT ?? 4173),
      strictPort: false
    },
    build: {
      outDir: "dist/client",
      emptyOutDir: true
    },
    define: mode === "production" ? {} : undefined
  };
});

export { sitefsApiPlugin, resolveSafeAsset };
