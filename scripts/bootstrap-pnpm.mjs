import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const version = "11.1.2";
const toolsDir = resolve(root, ".tools", "pnpm");
const tgzPath = resolve(toolsDir, "pnpm.tgz");
const pnpmPath = resolve(toolsDir, "package", "dist", "pnpm.mjs");
const tarball = `https://registry.npmjs.org/@pnpm/exe/-/exe-${version}.tgz`;

async function exists(path) {
  try {
    await import("node:fs/promises").then(({ access }) => access(path));
    return true;
  } catch {
    return false;
  }
}

function spawnChecked(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

if (await exists(pnpmPath)) {
  console.log(`pnpm already bootstrapped at ${pnpmPath}`);
  process.exit(0);
}

await rm(toolsDir, { recursive: true, force: true });
await mkdir(toolsDir, { recursive: true });

console.log(`Downloading pnpm ${version} from ${tarball}`);
const response = await fetch(tarball);
if (!response.ok || !response.body) {
  throw new Error(`Failed to download pnpm: HTTP ${response.status}`);
}

await pipeline(response.body, createWriteStream(tgzPath));
await spawnChecked("tar", ["-xzf", tgzPath, "-C", toolsDir]);
console.log(`pnpm ready at ${pnpmPath}`);
