// test/url-validation.test.js
import { isUrlSafe } from "../background/firebase-transport.js";

describe("URL Safety Validation", () => {
  test("accepts https protocol", () => {
    expect(isUrlSafe("https://example.com/page?id=1")).toBe(true);
  });

  test("accepts http protocol", () => {
    expect(isUrlSafe("http://localhost:3000")).toBe(true);
  });

  test("rejects javascript protocol", () => {
    expect(isUrlSafe("javascript:alert('xss')")).toBe(false);
  });

  test("rejects data protocol", () => {
    expect(isUrlSafe("data:text/html,<html><body>Hacked</body></html>")).toBe(false);
  });

  test("rejects file protocol", () => {
    expect(isUrlSafe("file:///etc/passwd")).toBe(false);
  });

  test("rejects malformed URLs", () => {
    expect(isUrlSafe("not-a-url")).toBe(false);
    expect(isUrlSafe("")).toBe(false);
    expect(isUrlSafe(null)).toBe(false);
  });

  test("rejects resource protocols", () => {
    expect(isUrlSafe("resource://gre/modules/CommonUtils.jsm")).toBe(false);
  });
});
