import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeOrigin, normalizePageUrl, pageSlugFromUrl } from "./url.js";

describe("url helpers", () => {
  it("normalizes origins and page URLs", () => {
    assert.equal(normalizeOrigin("https://Example.COM/path/"), "https://example.com");
    assert.equal(normalizePageUrl("https://example.com/a/?q=1#frag"), "https://example.com/a/?q=1");
    assert.equal(normalizePageUrl("https://example.com/"), "https://example.com");
  });

  it("builds stable page slugs (hyphen-separated path segments)", () => {
    assert.equal(pageSlugFromUrl("https://example.com/"), "home");
    assert.equal(pageSlugFromUrl("https://example.com/about"), "about");
    assert.equal(pageSlugFromUrl("https://example.com/blog/post-1"), "blog-post-1");
  });
});
