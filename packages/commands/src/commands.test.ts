import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isHostCommand, isLiveCommand, LIVE_COMMAND_NAMES } from "./live-commands.js";

describe("@sitefs/commands", () => {
  it("recognizes live commands", () => {
    assert.ok(isLiveCommand("ls"));
    assert.ok(isLiveCommand("web"));
    assert.equal(isLiveCommand("unknown"), false);
  });

  it("host commands include help", () => {
    assert.ok(isHostCommand("help"));
    assert.ok(LIVE_COMMAND_NAMES.length >= 40);
  });
});
