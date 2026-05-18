# SiteFS

SiteFS is a CLI-first QA agent runtime that turns browser state into a persistent, diffable filesystem.

The MVP exposes a `web` command inside a `just-bash` shell. Playwright controls Chromium in a worker process, and every browser action writes `/site/current` plus a numbered `/site/history/<id>` snapshot.

## Bootstrap

This repo does not require global `npm`, `pnpm`, or `corepack`.

```bash
node scripts/pnpm.mjs install
node scripts/pnpm.mjs --filter @sitefs/browser exec playwright install chromium
node scripts/pnpm.mjs -r build
```

## Run

```bash
node packages/cli/dist/index.js shell --session .sitefs --headed
```

Preflight and demo:

```bash
node packages/cli/dist/index.js doctor
node packages/cli/dist/index.js demo --session .sitefs-demo
```

MCP server for Codex or another MCP client:

```bash
node packages/cli/dist/index.js mcp --session .sitefs
```

The MCP server exposes tools such as `sitefs_open`, `sitefs_click`, `sitefs_type`, `sitefs_read`, `sitefs_diff`, and `sitefs_report`, plus `sitefs:///current/*` resources.

Inside the shell:

```bash
web open https://example.com
ls /site/current
cat /site/current/visible_text.txt
cat /site/current/forms.json | jq
web history
web report
```

Useful commands:

```bash
web click "Login"
web type "Email" "bad@example.com"
web diff 0001 0002
web check-console-errors
web check-broken-links
web flow start login
web flow step "Submit invalid credentials"
web flow report login
```

## Test

```bash
node scripts/pnpm.mjs -r test
SITEFS_RUN_BROWSER_TESTS=1 node scripts/pnpm.mjs --filter @sitefs/browser test
```
