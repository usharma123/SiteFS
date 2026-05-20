# SiteFS

SiteFS is a CLI-first QA agent runtime with **two layers**:

1. **Live AX shell** (DOMShell-style) — `tabs`, `here`, `ls`, `cd`, `click`, `find`, `grep`, … via just-bash custom commands and an in-memory accessibility tree from Playwright CDP.
2. **Evidence `/site`** — persistent snapshots, axe/console/link QA, crawl, visual diff, and `web *` commands for CI-grade reports.

Playwright controls Chromium in a worker process (multi-tab). Write actions can auto-snapshot to `/site/current`.

## Bootstrap

This repo does not require global `npm`, `pnpm`, or `corepack`.

```bash
node scripts/pnpm.mjs install
node scripts/pnpm.mjs --filter @sitefs/browser exec playwright install chromium
node scripts/pnpm.mjs -r build
```

## Quick test

One-shot QA against a URL:

```bash
node packages/cli/dist/index.js test https://utsav.sh --session .sitefs-utsav
node packages/cli/dist/index.js test https://utsav.sh --crawl --session .sitefs-utsav
```

## Run

```bash
node packages/cli/dist/index.js shell --session .sitefs --headed
```

Live shell (after `open` or `here`):

```bash
tabs
here
ls
cd main
click home_link
find --type link
web check-all
```

Preflight and demo:

```bash
node packages/cli/dist/index.js doctor
node packages/cli/dist/index.js demo --session .sitefs-demo
```

MCP server for Codex or another MCP client:

```bash
node packages/cli/dist/index.js mcp --session .sitefs --allow-write
```

MCP tools mirror DOMShell (`sitefs_ls`, `sitefs_cd`, `sitefs_click`, `sitefs_extract_table`, …), plus QA (`sitefs_check_all`, `sitefs_crawl`, `sitefs_web`), `sitefs_execute`, and `sitefs:///` resources. Read evidence files with `sitefs_read_site` (AX subtree uses `sitefs_read`). `sitefs_screenshot` saves a PNG under the session and returns it inline in MCP responses.

Live shell extras matching DOMShell ergonomics: `goto` (alias for `navigate`), `cd tabs/github` (substring tab match), `cd windows/1`, `cd @bookmark`, `ls --after`/`--before`/`--meta`/`--text`, `find --content`, `extract_table [--format csv]`, `each --pattern`, and `!n` history replay.

## Session config

`<session>/config.json` (optional):

```json
{
  "autoCheckStatic": false,
  "autoCheckFull": false,
  "failOnWarnings": false,
  "linkScope": "same-origin",
  "crawlMaxPages": 20,
  "waitUntil": "networkidle",
  "networkIdleTimeoutMs": 3000,
  "userDataDir": "",
  "autoSnapshotOnWrite": true,
  "allowWrite": true,
  "allowSensitive": false
}
```

## Shell commands

Inside the shell:

```bash
web open https://example.com
web open https://example.com --wait-for main
ls /site/current
cat /site/current/visible_text.txt
web history
web check-all
web report
```

Crawl, diff, and visual diff:

```bash
web crawl https://example.com --max-pages=10
web diff latest
web diff-visual latest
web click "Toggle theme"
web diff latest
```

Individual checks (also included in `web check-all` and `web report`):

```bash
web check-console-errors
web check-broken-links
web check-broken-links --all-links
web check-a11y
web check-forms
web check-buttons
```

Flows:

```bash
web flow start login
web flow step "Submit invalid credentials"
web flow report login
```

Reports are written under `/site/reports/` including `qa-summary.md` and `qa-summary.json`. Session overview: `/site/README.md`.

## Interactive viewer

After `sitefs test` or `web check-all` in the shell, SiteFS builds a viewer manifest, registers the run in a global history index, and opens a local dev server (default `http://localhost:4173`).

```bash
node packages/cli/dist/index.js test https://example.com --session .sitefs-demo
node packages/cli/dist/index.js view --session .sitefs-demo
```

The viewer uses [@pierre/trees](https://trees.software/) for a site-as-filesystem tree (pages, reports, crawl manifest) and [@pierre/diffs](https://diffs.com/) for page-level text diffs against the previous run of the same origin.

Run history is stored globally at `~/.sitefs/runs/index.json` (override with `SITEFS_REGISTRY_DIR`). Each session also writes `site/viewer-manifest.json`.

Flags and env:

- `--no-open` — start the viewer server without opening a browser tab
- `--port 4173` — viewer port (also `SITEFS_VIEWER_PORT`)
- `SITEFS_NO_VIEWER=1` — disable auto-open after `test` / `web check-all`
- `SITEFS_SESSION_ROOT` — session path for the viewer server process

## Test

```bash
node scripts/pnpm.mjs -r test
SITEFS_RUN_BROWSER_TESTS=1 node scripts/pnpm.mjs --filter @sitefs/browser test
```
