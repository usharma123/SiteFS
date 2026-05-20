import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AxEntry } from "./types.js";
import { extractTable, findTableEntry } from "./extract.js";

function tableTree(): AxEntry {
  const cell = (segment: string, name: string): AxEntry => ({
    id: segment,
    segment,
    path: segment,
    role: "cell",
    name,
    isDirectory: false,
    childIds: [],
    children: []
  });
  const row = (segment: string, cells: AxEntry[]): AxEntry => ({
    id: segment,
    segment,
    path: segment,
    role: "row",
    name: "",
    isDirectory: true,
    childIds: [],
    children: cells
  });
  return {
    id: "table",
    segment: "data_table",
    path: "data_table",
    role: "table",
    name: "Data",
    isDirectory: true,
    childIds: [],
    children: [
      row("row_1", [cell("a1", "A1"), cell("b1", "B1")]),
      row("row_2", [cell("a2", "A2"), cell("b2", "B2")])
    ]
  };
}

describe("extractTable", () => {
  it("finds nested table", () => {
    const root: AxEntry = {
      id: "root",
      segment: "/",
      path: "/",
      role: "RootWebArea",
      name: "",
      isDirectory: true,
      childIds: [],
      children: [tableTree()]
    };
    assert.ok(findTableEntry(root));
  });

  it("emits markdown pipe table", () => {
    const md = extractTable(tableTree(), "md");
    assert.match(md, /\| A1 \| B1 \|/);
    assert.match(md, /\| A2 \| B2 \|/);
    assert.match(md, /\| --- \| --- \|/);
  });

  it("emits csv", () => {
    const csv = extractTable(tableTree(), "csv");
    assert.equal(csv, "A1,B1\nA2,B2\n");
  });
});
