import { describe, it, expect } from "vitest";
import DOMPurify from "dompurify";
import { JSDOM } from "jsdom";

const window = new JSDOM("").window;
const purify = DOMPurify(window as any);

describe("CopyBodyEditor XSS sanitization", () => {
  it("strips <script> tags from HTML value", () => {
    const dirty = '<b>bold</b><script>alert("xss")</script>';
    const clean = purify.sanitize(dirty);
    expect(clean).not.toContain("<script>");
    expect(clean).toContain("<b>bold</b>");
  });

  it("strips onerror event handlers", () => {
    const dirty = '<img src="x" onerror="alert(1)">';
    const clean = purify.sanitize(dirty);
    expect(clean).not.toContain("onerror");
  });

  it("strips javascript: hrefs", () => {
    const dirty = '<a href="javascript:alert(1)">click</a>';
    const clean = purify.sanitize(dirty);
    expect(clean).not.toContain("javascript:");
  });

  it("preserves safe formatting tags", () => {
    const safe = "<b>bold</b> <i>italic</i> <ul><li>item</li></ul>";
    const clean = purify.sanitize(safe);
    expect(clean).toBe(safe);
  });
});
