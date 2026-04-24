import { describe, test, expect } from "bun:test";
import { extensionFromContentType, MAX_IMAGES, downloadImage } from "./vision.ts";
import { existsSync, readFileSync } from "fs";

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

describe("downloadImage", () => {
  test("downloads a valid jpeg to /tmp and returns path + cleanup", async () => {
    // Use a data URL-style mock: we'll spin up a tiny fixture file and serve it via file://
    // Simplest approach: stub `fetch` globally for this test
    const originalFetch = globalThis.fetch;
    const fakeBody = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]); // JPEG magic
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      headers: { get: (k: string) => (k.toLowerCase() === "content-type" ? "image/jpeg" : null) },
      arrayBuffer: async () => fakeBody.buffer,
    })) as typeof fetch;

    try {
      const result = await downloadImage("https://fake/img.jpg", { pageId: "abc123", index: 0 });
      expect(result.path.startsWith("/tmp/meal-abc123-")).toBe(true);
      expect(result.path.endsWith("-0.jpg")).toBe(true);
      expect(existsSync(result.path)).toBe(true);
      expect(readFileSync(result.path)).toEqual(Buffer.from(fakeBody));
      result.cleanup();
      expect(existsSync(result.path)).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("unsupported content-type returns null", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      headers: { get: () => "image/gif" },
      arrayBuffer: async () => new ArrayBuffer(4),
    })) as typeof fetch;

    try {
      const result = await downloadImage("https://fake/img.gif", { pageId: "abc", index: 0 });
      expect(result).toBe(null);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("HTTP error returns null", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({
      ok: false,
      status: 404,
      headers: { get: () => "image/jpeg" },
      arrayBuffer: async () => new ArrayBuffer(0),
    })) as typeof fetch;

    try {
      const result = await downloadImage("https://fake/404.jpg", { pageId: "abc", index: 0 });
      expect(result).toBe(null);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
