import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { runShell } from "./shell.js";

export interface DemoOptions {
  sessionRoot: string;
  headed: boolean;
}

const demoHtml = `<!doctype html>
<html>
  <head><title>SiteFS Demo Login</title></head>
  <body>
    <main>
      <h1>Login</h1>
      <form name="login" id="login-form">
        <label for="email">Email</label>
        <input id="email" name="email" type="email" required>
        <label for="password">Password</label>
        <input id="password" name="password" type="password" required>
        <button type="submit">Submit</button>
      </form>
      <p id="error" role="alert"></p>
    </main>
    <script>
      document.getElementById("login-form").addEventListener("submit", (event) => {
        event.preventDefault();
        document.getElementById("error").textContent = "Invalid email or password.";
      });
    </script>
  </body>
</html>`;

export async function runDemo(options: DemoOptions): Promise<void> {
  const sessionRoot = resolve(options.sessionRoot);
  await rm(sessionRoot, { recursive: true, force: true });
  const url = `data:text/html,${encodeURIComponent(demoHtml)}`;
  await runShell({
    sessionRoot,
    headed: options.headed,
    commands: [
      "web flow start login",
      `web open '${url}'`,
      "web type Email bad@example.com",
      "web type Password wrongpass",
      "web click Submit",
      "web diff latest",
      "web check-console-errors",
      "web report",
      "web flow end",
      "web flow report login"
    ]
  });
  process.stdout.write(`Demo session written to ${sessionRoot}/site\n`);
}
