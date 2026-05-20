# SiteFS architecture

SiteFS is a pnpm monorepo for CLI-first QA with two cooperating layers:

1. **Live AX shell** — navigate the page via an in-memory accessibility filesystem (`@sitefs/axfs`) backed by Playwright CDP.
2. **Evidence `/site`** — durable snapshots, QA reports, crawl manifests, and viewer manifests on disk (`@sitefs/sitefs`).

The CLI (`packages/cli`, npm name `sitefs`) wires layers together; MCP exposes the same surface as tools.

## Package map

| Package | Role |
|---------|------|
| `@sitefs/sitefs` | Session store, snapshot/history I/O, page diffs, run registry, viewer manifest |
| `@sitefs/axfs` | CDP tree → virtual paths; `ls` / `find` / `grep`; AX filesystem diff |
| `@sitefs/browser` | Playwright backend + worker subprocess (IPC) |
| `@sitefs/qa` | Static checks, link probes, report builders |
| `@sitefs/viewer` | React UI reading `viewer-manifest.json` |
| `@sitefs/commands` | Shared live/web command catalog (shell + MCP) |
| `@sitefs/live` | `BrowserHost` and live command handlers |
| `@sitefs/session` | `createSessionContext()` factory for shell/MCP |
| `sitefs` (cli) | Bin entrypoints: `shell`, `mcp`, `test`, `view`, `doctor` |

## Dependency rules

- `@sitefs/sitefs` and `@sitefs/axfs` must **not** import `browser`, `cli`, or `qa`.
- `@sitefs/browser` imports types from `@sitefs/sitefs` only (snapshot shapes).
- Orchestration flows **down**: `cli` → `session` → `live` / `browser` / `sitefs` / `qa` / `axfs`.

## Session layout

```
<sessionRoot>/
  config.json              # optional SessionConfig
  viewer-manifest.json     # written on finalize / check-all
  site/
    README.md
    current/               # latest snapshot artifacts
    history/<snapshotId>/  # immutable snapshots
    pages/<slug>/          # named page copies + issues.json
    reports/               # QA markdown/json, diffs
    crawl/manifest.json
    flows/<name>.json
```

Slug policy: page slugs under `/site/pages` use **hyphens** (`slugifyName` in sitefs). AX path segments use **underscores** (`slugify` in axfs).

## Browser worker protocol

Playwright runs in a **child process** so the main CLI/MCP process stays light.

- Parent: `WorkerBrowserBackend` spawns `browser-worker.js`, speaks **newline-delimited JSON**.
- Request: `{ "id": number, "method": string, "args": unknown[] }`
- Response: `{ "id": number, "ok": boolean, "result"?: unknown, "error"?: string }`
- Methods mirror `LiveBrowserBackend` (`open`, `clickAx`, `getAccessibilityTree`, `snapshot`, …).

## Command routing

| Layer | Examples | Handler |
|-------|----------|---------|
| Live | `ls`, `cd`, `click`, `find` | `BrowserHost` (`@sitefs/live`) |
| Web | `web open`, `web check-all`, `web crawl` | `WebRuntime` (cli `web/`) |
| Meta | `history`, `script`, `!n` | `BrowserHost` |

`@sitefs/commands` holds the canonical command list; shell `just-bash` custom commands and MCP tools derive from it.

## Diff modules (naming)

- **`snapshot-diff`** (`@sitefs/sitefs`) — compares persisted `PageSnapshot` (links, buttons, screenshots).
- **`filesystem-diff`** (`@sitefs/axfs`) — compares live `AxFilesystem` trees (`diffAxFilesystem`).

## Public API curation

Package `index.ts` files export stable surfaces only. Internal helpers (e.g. `getRegistryDir`, `writePageIssues`) stay module-private unless a sibling package needs them.
