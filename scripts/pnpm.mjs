import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pnpmPath = resolve(root, ".tools", "pnpm", "package", "dist", "pnpm.mjs");

try {
  await access(pnpmPath);
} catch {
  await import("./bootstrap-pnpm.mjs");
}

const child = spawn(process.execPath, [pnpmPath, ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
  env: process.env
});

child.on("exit", (code) => process.exit(code ?? 1));
