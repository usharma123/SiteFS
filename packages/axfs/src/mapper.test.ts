import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildAxFilesystem, resolvePath } from "./mapper.js";

describe("buildAxFilesystem", () => {
  it("maps navigation and links", () => {
    const fs = buildAxFilesystem({
      nodes: [
        { nodeId: "1", role: { value: "RootWebArea" }, childIds: ["2", "3"] },
        { nodeId: "2", parentId: "1", role: { value: "navigation" }, name: { value: "Nav" }, childIds: ["4"] },
        { nodeId: "3", parentId: "1", role: { value: "main" }, childIds: [] },
        { nodeId: "4", parentId: "2", role: { value: "link" }, name: { value: "Home" }, childIds: [] }
      ]
    });
    assert.ok(fs.nodeCount >= 3);
    const nav = resolvePath(fs, "navigation", "");
    assert.ok(nav?.isDirectory);
    const home = resolvePath(fs, "navigation/home_link", "");
    assert.equal(home?.role, "link");
  });

  it("flattens unnamed generic single-child", () => {
    const fs = buildAxFilesystem({
      nodes: [
        { nodeId: "1", role: { value: "RootWebArea" }, childIds: ["2"] },
        { nodeId: "2", parentId: "1", role: { value: "generic" }, childIds: ["3"] },
        { nodeId: "3", parentId: "2", role: { value: "button" }, name: { value: "Go" }, childIds: [] }
      ]
    });
    const btn = resolvePath(fs, "go_btn", "");
    assert.equal(btn?.role, "button");
  });
});
