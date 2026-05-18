import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chromium } from "playwright";
import { extractorScript } from "./extractors.js";

const runBrowserTests = process.env.SITEFS_RUN_BROWSER_TESTS === "1";

describe("browser extractors", { skip: !runBrowserTests }, () => {
  it("extracts forms, links, buttons, inputs, and visible text from a page", async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setContent(`
      <main>
        <a href="/pricing">Pricing</a>
        <form name="login">
          <label for="email">Email</label>
          <input id="email" name="email" type="email" required>
          <button type="submit">Login</button>
        </form>
      </main>
    `);

    const extracted = await page.evaluate(extractorScript);
    await browser.close();

    assert.match(extracted.visibleText, /Pricing/);
    assert.equal(extracted.links[0]?.text, "Pricing");
    assert.equal(extracted.forms[0]?.name, "login");
    assert.equal(extracted.inputs[0]?.label, "Email");
    assert.equal(extracted.buttons[0]?.text, "Login");
  });
});
