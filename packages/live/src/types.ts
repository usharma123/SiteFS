/** Minimal web QA surface used by BrowserHost (`web` command passthrough). */
export interface WebCommandHandler {
  handle(args: string[]): Promise<string>;
  close?(): Promise<void>;
}
