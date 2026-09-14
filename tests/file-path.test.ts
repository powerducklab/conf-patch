import { describe, it, expect } from "vitest";
import { normalizeFilePath } from "../src/utils/file-path.js";

describe("normalizeFilePath", () => {
  it("resolves a relative path to an absolute path", () => {
    const result = normalizeFilePath("config/app.json");
    expect(result).toBeTruthy();
    expect(result.startsWith("/")).toBe(true);
    expect(result.endsWith("config/app.json")).toBe(true);
  });

  it("returns an absolute path unchanged", () => {
    const absolute = "/tmp/app/config.json";
    expect(normalizeFilePath(absolute)).toBe(absolute);
  });

  it("converts a file URL to a native path", () => {
    const result = normalizeFilePath("file:///tmp/app/config.json");
    expect(result).toBe("/tmp/app/config.json");
  });

  it("throws for an empty string", () => {
    expect(() => normalizeFilePath("")).toThrow(TypeError);
  });

  it("throws for a non-string input", () => {
    expect(() => normalizeFilePath(null as unknown as string)).toThrow(TypeError);
    expect(() => normalizeFilePath(undefined as unknown as string)).toThrow(TypeError);
    expect(() => normalizeFilePath(42 as unknown as string)).toThrow(TypeError);
  });

  it("throws for an invalid file URL", () => {
    expect(() => normalizeFilePath("file://not-a-valid-url")).toThrow();
  });

  it("preserves Unicode and whitespace in file names", () => {
    const result = normalizeFilePath("/tmp/my config/app config.json");
    expect(result).toBe("/tmp/my config/app config.json");
  });
});
