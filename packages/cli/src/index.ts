#!/usr/bin/env node
import { runShell } from "./shell.js";
import { runDoctor } from "./doctor.js";
import { runDemo } from "./demo.js";
import { runMcpServer } from "./mcp-server.js";

interface CliOptions {
  command: "shell" | "doctor" | "demo" | "mcp";
  sessionRoot: string;
  headed: boolean;
  commands: string[];
}

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
    await runMcpServer({ sessionRoot: options.sessionRoot, headed: options.headed });
    return;
  }
  if (options.command !== "shell") {
    throw new Error("Usage: sitefs <shell|doctor|demo|mcp> [--session .sitefs] [--headed] [--command <cmd>]");
  }
  await runShell({
    sessionRoot: options.sessionRoot,
    headed: options.headed,
    commands: options.commands
  });
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    command: "shell",
    sessionRoot: ".sitefs",
    headed: false,
    commands: []
  };

  if (args[0] && !args[0].startsWith("-")) {
    const command = args.shift();
    if (command !== "shell" && command !== "doctor" && command !== "demo" && command !== "mcp") {
      throw new Error(`Unknown command: ${command}`);
    }
    options.command = command;
  }

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    switch (arg) {
      case "--session":
        options.sessionRoot = requireValue(args[++index], "--session");
        break;
      case "--headed":
        options.headed = true;
        break;
      case "--command":
      case "-c":
        options.commands.push(requireValue(args[++index], arg));
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function requireValue(value: string | undefined, flag: string): string {
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

function printHelp(): void {
  process.stdout.write(`Usage:
  sitefs shell [--session .sitefs] [--headed]
  sitefs shell --command "web open https://example.com"
  sitefs doctor [--session .sitefs]
  sitefs demo [--session .sitefs-demo] [--headed]
  sitefs mcp [--session .sitefs] [--headed]

The shell mounts the persistent website filesystem at /site.
`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
