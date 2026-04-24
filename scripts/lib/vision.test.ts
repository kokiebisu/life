import { describe, test, expect } from "bun:test";
import { extensionFromContentType, MAX_IMAGES } from "./vision.ts";

describe("extensionFromContentType", () => {
  test("image/jpeg → jpg", () => {
    expect(extensionFromContentType("image/jpeg")).toBe("jpg");
  });

  test("image/png → png", () => {
    expect(extensionFromContentType("image/png")).toBe("png");
  });

  test("image/webp → webp", () => {
    expect(extensionFromContentType("image/webp")).toBe("webp");
  });

  test("image/jpg → jpg (alias)", () => {
    expect(extensionFromContentType("image/jpg")).toBe("jpg");
  });

  test("Content-Type with charset → still matches", () => {
    expect(extensionFromContentType("image/jpeg; charset=utf-8")).toBe("jpg");
  });

  test("uppercase Content-Type → still matches", () => {
    expect(extensionFromContentType("IMAGE/PNG")).toBe("png");
  });

  test("unsupported type → null", () => {
    expect(extensionFromContentType("image/gif")).toBe(null);
    expect(extensionFromContentType("application/pdf")).toBe(null);
  });

  test("null → null", () => {
    expect(extensionFromContentType(null)).toBe(null);
  });
});

describe("constants", () => {
  test("MAX_IMAGES is 5", () => {
    expect(MAX_IMAGES).toBe(5);
  });
});
