#!/usr/bin/env node
import { parseArgs } from "./cli-args.js";
import { runShell } from "./shell.js";
import { runDoctor } from "./doctor.js";
import { runDemo } from "./demo.js";
import { runMcpServer } from "./mcp/server.js";
import { runTest } from "./test.js";
import { runView } from "./view.js";

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === "doctor") {
    await runDoctor({ sessionRoot: options.sessionRoot });
    return;
  }
  if (options.command === "demo") {
    await runDemo({ sessionRoot: options.sessionRoot, headed: options.headed });
    return;
  }
  if (options.command === "mcp") {
    await runMcpServer({
      sessionRoot: options.sessionRoot,
      headed: options.headed,
      allowWrite: options.allowWrite,
      allowSensitive: options.allowSensitive
    });
    return;
  }
  if (options.command === "test") {
    const url = options.testUrl;
    if (!url) throw new Error("Usage: sitefs test <url> [--session .sitefs] [--crawl] [--headed] [--fresh] [--no-open]");
    const code = await runTest({
      url,
      sessionRoot: options.sessionRoot,
      headed: options.headed,
      crawl: options.testCrawl,
      fresh: options.testFresh,
      noOpen: options.noOpen
    });
    process.exitCode = code;
    return;
  }
  if (options.command === "view") {
    await runView({
      sessionRoot: options.sessionRoot,
      port: options.viewerPort,
      open: !options.noOpen,
      finalize: options.finalizeViewer
    });
    return;
  }
  if (options.command !== "shell") {
    throw new Error("Usage: sitefs <shell|doctor|demo|mcp|test|view> [--session .sitefs] [--headed] [--command <cmd>]");
  }
  await runShell({
    sessionRoot: options.sessionRoot,
    headed: options.headed,
    commands: options.commands,
    allowWrite: options.allowWrite,
    allowSensitive: options.allowSensitive
  });
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
