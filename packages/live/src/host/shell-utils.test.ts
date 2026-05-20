import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseArgs, parseLsOptions } from "./shell-utils.js";

describe("shell-utils", () => {
  it("parseArgs respects quotes", () => {
    assert.deepEqual(parseArgs('click "Sign in"'), ["click", "Sign in"]);
    assert.deepEqual(parseArgs("find --type link"), ["find", "--type", "link"]);
  });

  it("parseLsOptions collects flags and paths", () => {
    const opts = parseLsOptions(["-l", "--meta", "main", "footer"]);
    assert.equal(opts.long, true);
    assert.equal(opts.meta, true);
    assert.deepEqual(opts.paths, ["main", "footer"]);
  });
});
