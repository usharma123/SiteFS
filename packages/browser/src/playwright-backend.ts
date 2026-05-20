import { createHash } from "node:crypto";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type ConsoleMessage,
  type Page,
  type Request,
  type Response
} from "playwright";
import { AxeBuilder } from "@axe-core/playwright";
import type { AxeViolationSummary, ConsoleLog, LinkProbeResult, NetworkLog, PageSnapshot } from "@sitefs/sitefs";
import { extractorScript } from "./extractors.js";
import type {
  BrowserBackendOptions,
  LiveBrowserBackend,
  OpenOptions,
  SubmitAxOptions,
  TabInfo,
  WaitAxOptions,
  WindowInfo
} from "./types.js";

const blockedStatuses = new Set([403, 999]);
const blockedHostPatterns = [/linkedin\.com/i, /twitter\.com/i, /x\.com/i];
const browserUserAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface TabRecord {
  id: number;
  page: Page;
  windowId: number;
}

export class PlaywrightBrowserBackend implements LiveBrowserBackend {
  private browser?: Browser;
  private context?: BrowserContext;
  private tabs = new Map<number, TabRecord>();
  private activeTabId?: number;
  private nextTabId = 1;
  private consoleLogs: ConsoleLog[] = [];
  private networkLogs: NetworkLog[] = [];
  private readonly options: Required<BrowserBackendOptions>;

  constructor(options: BrowserBackendOptions = {}) {
    this.options = {
      headed: options.headed ?? false,
      timeoutMs: options.timeoutMs ?? 10000,
      waitUntil: options.waitUntil ?? "networkidle",
      networkIdleTimeoutMs: options.networkIdleTimeoutMs ?? 3000,
      userDataDir: options.userDataDir ?? ""
    };
  }

  async open(url: string, openOptions: OpenOptions = {}): Promise<void> {
    const page = await this.ensurePage();
    await page.goto(url, { waitUntil: "domcontentloaded" });
    if (openOptions.waitForSelector) {
      await page.waitForSelector(openOptions.waitForSelector, { timeout: this.options.timeoutMs }).catch(() => {});
    }
    await this.waitForPageStability();
  }

  async navigate(url: string): Promise<void> {
    return this.open(url);
  }

  async click(target: string): Promise<void> {
    return this.clickAx(target);
  }

  async type(target: string, value: string): Promise<void> {
    return this.typeAx(value, target);
  }

  async clickAx(target: string): Promise<void> {
    const locator = await this.locatorForTarget(target);
    await locator.click();
    await this.waitForPageStability();
  }

  async focusAx(target: string): Promise<void> {
    const locator = await this.locatorForTarget(target);
    await locator.focus();
  }

  async typeAx(text: string, target?: string): Promise<void> {
    const locator = target ? await this.locatorForTarget(target) : (await this.ensurePage()).locator(":focus");
    await locator.fill(text);
    await this.waitForPageStability();
  }

  async submitAx(options: SubmitAxOptions): Promise<void> {
    for (const field of options.fields) {
      await this.typeAx(field.value, field.target);
    }
    if (options.submit) {
      await this.clickAx(options.submit);
    } else {
      const page = await this.ensurePage();
      await page.keyboard.press("Enter");
      await this.waitForPageStability();
    }
  }

  async selectAx(target: string, value: string): Promise<void> {
    const locator = await this.locatorForTarget(target);
    await locator.selectOption(value).catch(async () => {
      await locator.selectOption({ label: value });
    });
    await this.waitForPageStability();
  }

  async scroll(direction: "up" | "down"): Promise<void> {
    await this.scrollAx(direction, 1);
  }

  async scrollAx(direction: "up" | "down" | string, amount = 1): Promise<string> {
    const page = await this.ensurePage();
    if (direction !== "up" && direction !== "down") {
      const locator = await this.locatorForTarget(direction);
      await locator.scrollIntoViewIfNeeded();
      return "Scrolled element into view";
    }
    const delta = (direction === "down" ? 1 : -1) * windowLikeHeight * amount;
    await page.mouse.wheel(0, delta);
    await this.waitForPageStability();
    const pct = await page.evaluate(() => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      return max <= 0 ? 0 : Math.round((window.scrollY / max) * 100);
    });
    return `Scroll position: ${pct}%`;
  }

  async wait(ms: number): Promise<void> {
    const page = await this.ensurePage();
    await page.waitForTimeout(ms);
  }

  async waitAx(options: WaitAxOptions): Promise<void> {
    const timeout = Math.min(options.timeoutMs ?? 5000, 30000);
    const page = await this.ensurePage();
    const pattern = options.pattern;
    if (pattern) {
      await page.getByText(new RegExp(escapeRegex(pattern), "i")).first().waitFor({ timeout });
      return;
    }
    if (options.type) {
      await page.waitForTimeout(200);
      return;
    }
    await page.waitForTimeout(timeout);
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

  async listTabs(): Promise<TabInfo[]> {
    await this.ensureContext();
    return Promise.all([...this.tabs.values()].map((t) => this.tabInfo(t)));
  }

  async listWindows(): Promise<WindowInfo[]> {
    const tabs = await this.listTabs();
    return [{ id: 1, focused: true, tabs }];
  }

  async switchTab(id: number): Promise<TabInfo> {
    const tab = this.tabs.get(id);
    if (!tab) throw new Error(`Tab ${id} not found`);
    this.activeTabId = id;
    await tab.page.bringToFront();
    return this.tabInfo(tab);
  }

  async openTab(url: string): Promise<TabInfo> {
    const context = await this.ensureContext();
    const page = await context.newPage();
    page.setDefaultTimeout(this.options.timeoutMs);
    this.attachLogging(page);
    const id = this.nextTabId++;
    const record: TabRecord = { id, page, windowId: 1 };
    this.tabs.set(id, record);
    this.activeTabId = id;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await this.waitForPageStability();
    return this.tabInfo(record);
  }

  async closeTab(id?: number): Promise<void> {
    const tabId = id ?? this.activeTabId;
    if (!tabId) return;
    const tab = this.tabs.get(tabId);
    if (!tab) throw new Error(`Tab ${tabId} not found`);
    await tab.page.close();
    this.tabs.delete(tabId);
    if (this.activeTabId === tabId) {
      const remaining = [...this.tabs.keys()];
      this.activeTabId = remaining[0];
    }
    if (this.tabs.size === 0) this.activeTabId = undefined;
  }

  async getActiveTab(): Promise<TabInfo> {
    const tab = await this.ensureActiveTab();
    return this.tabInfo(tab);
  }

  async refreshAxTree(): Promise<unknown> {
    const page = await this.ensurePage();
    return this.getAccessibilityTree(page);
  }

  async evaluateJs(expression: string, allowWrite = true): Promise<unknown> {
    void allowWrite;
    const page = await this.ensurePage();
    return page.evaluate(async ({ expr }) => {
      const fn = new Function(`return (async () => { return (${expr}); })()`);
      return await fn();
    }, { expr: expression });
  }

  async listFunctions(pattern?: string): Promise<Array<{ name: string; arity: number }>> {
    const page = await this.ensurePage();
    const names = await page.evaluate(() => {
      const out: Array<{ name: string; arity: number }> = [];
      for (const key of Object.getOwnPropertyNames(window)) {
        try {
          const val = (window as unknown as Record<string, unknown>)[key];
          if (typeof val === "function") out.push({ name: key, arity: val.length });
        } catch {
          /* skip */
        }
      }
      return out;
    });
    if (!pattern) return names.slice(0, 100);
    const re = new RegExp(pattern, "i");
    return names.filter((n) => re.test(n.name));
  }

  async callFunction(name: string, args: unknown[]): Promise<unknown> {
    const page = await this.ensurePage();
    return page.evaluate(
      ({ fn, fnArgs }) => {
        const f = (globalThis as unknown as Record<string, unknown>)[fn];
        if (typeof f !== "function") throw new Error(`Function ${fn} not found`);
        return (f as (...a: unknown[]) => unknown)(...fnArgs);
      },
      { fn: name, fnArgs: args }
    );
  }

  async screenshotPng(): Promise<Buffer> {
    const page = await this.ensurePage();
    return page.screenshot({ fullPage: true });
  }

  async getCookies(): Promise<Array<{ name: string; domain: string; value: string }>> {
    const context = await this.ensureContext();
    const cookies = await context.cookies();
    return cookies.map((c) => ({ name: c.name, domain: c.domain, value: c.value }));
  }

  async snapshot(): Promise<PageSnapshot> {
    const page = await this.ensurePage();
    await this.waitForPageStability();
    const [title, url, extracted, accessibilityTree, screenshotBuffer, axeViolations] = await Promise.all([
      page.title(),
      Promise.resolve(page.url()),
      page.evaluate(extractorScript),
      this.getAccessibilityTree(page),
      page.screenshot({ fullPage: true }),
      this.runAxe(page)
    ]);

    const screenshotSha256 = screenshotBuffer
      ? createHash("sha256").update(screenshotBuffer).digest("hex")
      : undefined;

    return {
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
      screenshotBuffer,
      screenshotSha256,
      axeViolations
    };
  }

  async probeLink(href: string): Promise<LinkProbeResult> {
    const context = await this.ensureContext();
    try {
      let response = await context.request.fetch(href, {
        method: "HEAD",
        maxRedirects: 5,
        timeout: this.options.timeoutMs
      });
      if ([405, 501].includes(response.status())) {
        response = await context.request.fetch(href, {
          method: "GET",
          maxRedirects: 5,
          timeout: this.options.timeoutMs
        });
      }
      const status = response.status();
      const blocked = isBlockedLink(href, status);
      return { ok: status < 400 || blocked, status, blocked };
    } catch (error) {
      const blocked = isBlockedLink(href);
      return {
        ok: blocked,
        blocked,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async close(): Promise<void> {
    if (this.context && this.options.userDataDir) {
      await this.context.close();
    } else {
      await this.browser?.close();
    }
    this.browser = undefined;
    this.context = undefined;
    this.tabs.clear();
    this.activeTabId = undefined;
  }

  private async tabInfo(tab: TabRecord): Promise<TabInfo> {
    return {
      id: tab.id,
      title: await tab.page.title().catch(() => ""),
      url: tab.page.url(),
      active: tab.id === this.activeTabId,
      windowId: tab.windowId
    };
  }

  private async ensureActiveTab(): Promise<TabRecord> {
    if (this.activeTabId && this.tabs.has(this.activeTabId)) {
      return this.tabs.get(this.activeTabId)!;
    }
    await this.ensurePage();
    return this.tabs.get(this.activeTabId!)!;
  }

  private async ensureContext(): Promise<BrowserContext> {
    if (this.context) return this.context;
    if (this.options.userDataDir) {
      this.context = await chromium.launchPersistentContext(this.options.userDataDir, {
        headless: !this.options.headed,
        viewport: { width: 1280, height: 900 },
        userAgent: browserUserAgent
      });
      const pages = this.context.pages();
      if (pages.length === 0) {
        await this.registerPage(await this.context.newPage());
      } else {
        for (const p of pages) await this.registerPage(p);
      }
      return this.context;
    }
    this.browser = await chromium.launch({ headless: !this.options.headed });
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent: browserUserAgent
    });
    return this.context;
  }

  private async registerPage(page: Page): Promise<Page> {
    page.setDefaultTimeout(this.options.timeoutMs);
    this.attachLogging(page);
    const id = this.nextTabId++;
    this.tabs.set(id, { id, page, windowId: 1 });
    this.activeTabId = id;
    return page;
  }

  private async ensurePage(): Promise<Page> {
    if (this.activeTabId && this.tabs.has(this.activeTabId)) {
      return this.tabs.get(this.activeTabId)!.page;
    }
    const context = await this.ensureContext();
    if (this.tabs.size === 0) {
      await this.registerPage(await context.newPage());
    }
    return this.tabs.get(this.activeTabId!)!.page;
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
    const trimmed = target.trim().replace(/_(btn|link|input|chk|combo|switch|radio|heading|img)$/i, " ");
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
    if (this.options.waitUntil === "load") {
      await page.waitForLoadState("load", { timeout: this.options.timeoutMs }).catch(() => {});
    } else if (this.options.waitUntil === "networkidle") {
      await page.waitForLoadState("networkidle", { timeout: this.options.networkIdleTimeoutMs }).catch(() => {});
    }
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
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async runAxe(page: Page): Promise<AxeViolationSummary[]> {
    try {
      const results = await new AxeBuilder({ page }).analyze();
      return results.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact ?? undefined,
        description: violation.description,
        help: violation.help,
        nodes: violation.nodes.length
      }));
    } catch {
      return [];
    }
  }
}

const windowLikeHeight = 700;

function isBlockedLink(href: string, status?: number): boolean {
  if (status !== undefined && blockedStatuses.has(status)) return true;
  try {
    const host = new URL(href).hostname;
    return blockedHostPatterns.some((pattern) => pattern.test(host));
  } catch {
    return false;
  }
}

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
