import { chromium, type Browser, type BrowserContext, type ConsoleMessage, type Page, type Request, type Response } from "playwright";
import type { ConsoleLog, NetworkLog, PageSnapshot } from "@sitefs/sitefs";
import { extractorScript } from "./extractors.js";
import type { BrowserBackend, BrowserBackendOptions } from "./types.js";

export class PlaywrightBrowserBackend implements BrowserBackend {
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;
  private consoleLogs: ConsoleLog[] = [];
  private networkLogs: NetworkLog[] = [];
  private options: Required<BrowserBackendOptions>;

  constructor(options: BrowserBackendOptions = {}) {
    this.options = {
      headed: options.headed ?? false,
      timeoutMs: options.timeoutMs ?? 10000
    };
  }

  async open(url: string): Promise<void> {
    const page = await this.ensurePage();
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await this.waitForPageStability();
  }

  async click(target: string): Promise<void> {
    const page = await this.ensurePage();
    const locator = await this.locatorForTarget(target);
    await locator.click();
    await this.waitForPageStability();
  }

  async type(target: string, value: string): Promise<void> {
    const locator = await this.locatorForTarget(target);
    await locator.fill(value);
    await this.waitForPageStability();
  }

  async scroll(direction: "up" | "down"): Promise<void> {
    const page = await this.ensurePage();
    const delta = direction === "down" ? windowLikeHeight : -windowLikeHeight;
    await page.mouse.wheel(0, delta);
    await this.waitForPageStability();
  }

  async wait(ms: number): Promise<void> {
    const page = await this.ensurePage();
    await page.waitForTimeout(ms);
  }

  async back(): Promise<void> {
    const page = await this.ensurePage();
    await page.goBack({ waitUntil: "domcontentloaded" });
    await this.waitForPageStability();
  }

  async forward(): Promise<void> {
    const page = await this.ensurePage();
    await page.goForward({ waitUntil: "domcontentloaded" });
    await this.waitForPageStability();
  }

  async snapshot(): Promise<PageSnapshot> {
    const page = await this.ensurePage();
    await this.waitForPageStability();
    const [title, url, extracted, accessibilityTree, screenshotBuffer] = await Promise.all([
      page.title(),
      Promise.resolve(page.url()),
      page.evaluate(extractorScript),
      this.getAccessibilityTree(page),
      page.screenshot({ fullPage: true })
    ]);

    const snapshot: PageSnapshot = {
      id: "current",
      url,
      title,
      visibleText: extracted.visibleText,
      summary: buildSummary(url, title, extracted),
      accessibilityTree: {
        tree: accessibilityTree,
        issues: extracted.a11yIssues
      },
      dom: extracted.dom,
      links: extracted.links,
      buttons: extracted.buttons,
      forms: extracted.forms,
      inputs: extracted.inputs,
      consoleLogs: [...this.consoleLogs],
      networkLogs: [...this.networkLogs],
      screenshotPath: "screenshot.png",
      timestamp: new Date().toISOString(),
      screenshotBuffer
    };
    return snapshot;
  }

  async close(): Promise<void> {
    await this.browser?.close();
    this.browser = undefined;
    this.context = undefined;
    this.page = undefined;
  }

  private async ensurePage(): Promise<Page> {
    if (this.page) return this.page;
    this.browser = await chromium.launch({ headless: !this.options.headed });
    this.context = await this.browser.newContext({ viewport: { width: 1280, height: 900 } });
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.options.timeoutMs);
    this.attachLogging(this.page);
    return this.page;
  }

  private attachLogging(page: Page): void {
    page.on("console", (message: ConsoleMessage) => {
      this.consoleLogs.push({
        type: message.type(),
        text: message.text(),
        location: formatConsoleLocation(message),
        timestamp: new Date().toISOString()
      });
    });
    page.on("requestfailed", (request: Request) => {
      this.networkLogs.push({
        url: request.url(),
        method: request.method(),
        failure: request.failure()?.errorText ?? "request failed",
        resourceType: request.resourceType(),
        timestamp: new Date().toISOString()
      });
    });
    page.on("response", (response: Response) => {
      if (response.status() >= 400) {
        this.networkLogs.push({
          url: response.url(),
          method: response.request().method(),
          status: response.status(),
          statusText: response.statusText(),
          resourceType: response.request().resourceType(),
          timestamp: new Date().toISOString()
        });
      }
    });
  }

  private async locatorForTarget(target: string) {
    const page = await this.ensurePage();
    const trimmed = target.trim();
    const selectorLike = /^(#|\.|\[|\/|css=|xpath=|text=|role=|button|input|select|textarea|a\b)/.test(trimmed);
    if (selectorLike) {
      const locator = page.locator(trimmed).first();
      if (await locator.count().catch(() => 0)) return locator;
    }

    const escaped = escapeRegex(trimmed);
    const exact = new RegExp(`^${escaped}$`, "i");
    const candidates = [
      page.getByLabel(exact).first(),
      page.getByPlaceholder(exact).first(),
      page.getByRole("button", { name: exact }).first(),
      page.getByRole("link", { name: exact }).first(),
      page.getByRole("textbox", { name: exact }).first(),
      page.getByText(exact).first(),
      page.getByText(new RegExp(escaped, "i")).first()
    ];

    for (const candidate of candidates) {
      if (await candidate.count().catch(() => 0)) return candidate;
    }
    throw new Error(`No visible element matched "${target}"`);
  }

  private async waitForPageStability(): Promise<void> {
    const page = await this.ensurePage();
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 1500 }).catch(() => {});
    await page.waitForTimeout(150);
  }

  private async getAccessibilityTree(page: Page): Promise<unknown> {
    try {
      const session = await page.context().newCDPSession(page);
      await session.send("Accessibility.enable");
      const result = await session.send("Accessibility.getFullAXTree");
      await session.detach();
      return result;
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}

const windowLikeHeight = 700;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatConsoleLocation(message: ConsoleMessage): string | undefined {
  const location = message.location();
  return location.url ? `${location.url}:${location.lineNumber}:${location.columnNumber}` : undefined;
}

function buildSummary(url: string, title: string, extracted: ReturnType<typeof extractorScript>): string {
  const visibleControls = [
    ...extracted.inputs.map((input) => `${input.label || input.name || input.type} input`),
    ...extracted.buttons.map((button) => `${button.text || button.selector} button`),
    ...extracted.links.slice(0, 12).map((link) => `${link.text || link.href} link`)
  ];
  const warnings = [
    extracted.a11yIssues.length ? `${extracted.a11yIssues.length} accessibility issue(s)` : "No accessibility issues from MVP checks"
  ];
  return [
    "# Current Page",
    "",
    `URL: ${url}`,
    `Title: ${title}`,
    "",
    "Visible controls:",
    ...(visibleControls.length ? visibleControls.map((item) => `- ${item}`) : ["- None detected"]),
    "",
    "Detected forms:",
    ...(extracted.forms.length ? extracted.forms.map((form) => `- ${form.name}`) : ["- None detected"]),
    "",
    "Warnings:",
    ...warnings.map((warning) => `- ${warning}`)
  ].join("\n") + "\n";
}
