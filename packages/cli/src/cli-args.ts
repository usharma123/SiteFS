export interface CliOptions {
  command: "shell" | "doctor" | "demo" | "mcp" | "test" | "view";
  sessionRoot: string;
  headed: boolean;
  commands: string[];
  testUrl?: string;
  testCrawl: boolean;
  testFresh: boolean;
  allowWrite: boolean;
  allowSensitive: boolean;
  viewerPort: number;
  noOpen: boolean;
  finalizeViewer: boolean;
}

export function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    command: "shell",
    sessionRoot: ".sitefs",
    headed: false,
    commands: [],
    testCrawl: false,
    testFresh: false,
    allowWrite: true,
    allowSensitive: false,
    viewerPort: 4173,
    noOpen: false,
    finalizeViewer: true
  };

  if (args[0] && !args[0].startsWith("-")) {
    const command = args.shift();
    if (command !== "shell" && command !== "doctor" && command !== "demo" && command !== "mcp" && command !== "test" && command !== "view") {
      throw new Error(`Unknown command: ${command}`);
    }
    options.command = command;
    if (command === "test" && args[0] && !args[0].startsWith("-")) {
      options.testUrl = args.shift();
    }
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
      case "--crawl":
        options.testCrawl = true;
        break;
      case "--fresh":
        options.testFresh = true;
        break;
      case "--allow-write":
        options.allowWrite = true;
        break;
      case "--no-allow-write":
        options.allowWrite = false;
        break;
      case "--allow-sensitive":
        options.allowSensitive = true;
        break;
      case "--port":
        options.viewerPort = Number(requireValue(args[++index], "--port"));
        break;
      case "--no-open":
        options.noOpen = true;
        break;
      case "--no-finalize":
        options.finalizeViewer = false;
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

export function printHelp(): void {
  process.stdout.write(`Usage:
  sitefs shell [--session .sitefs] [--headed]
  sitefs shell --command "web open https://example.com"
  sitefs test <url> [--session .sitefs] [--crawl] [--headed] [--fresh] [--no-open]
  sitefs view [--session .sitefs] [--port 4173] [--no-open] [--no-finalize]
  sitefs doctor [--session .sitefs]
  sitefs demo [--session .sitefs-demo] [--headed]
  sitefs mcp [--session .sitefs] [--headed] [--allow-write] [--allow-sensitive]

Live AX commands: tabs, here, ls, cd, click, find, ...  QA: web check-all, web report
The shell mounts /site for snapshot evidence.
Session config: <session>/config.json
`);
}
