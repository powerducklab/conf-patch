import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, readFile, writeFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { atomicWrite } from "../src/file/atomic-write.js";

let tempDir: string;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "confedit-atomic-"));
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("atomicWrite", () => {
  it("writes content to a new file", async () => {
    const filePath = join(tempDir, "new-file.json");
    await atomicWrite(filePath, '{"name":"test"}');
    const content = await readFile(filePath, "utf8");
    expect(content).toBe('{"name":"test"}');
  });

  it("overwrites an existing file", async () => {
    const filePath = join(tempDir, "existing.json");
    await writeFile(filePath, "old content", "utf8");
    await atomicWrite(filePath, "new content");
    const content = await readFile(filePath, "utf8");
    expect(content).toBe("new content");
  });

  it("preserves the file mode bits of an existing file", async () => {
    const filePath = join(tempDir, "mode-test.json");
    await writeFile(filePath, "test", "utf8");
    await import("node:fs/promises").then((fs) => fs.chmod(filePath, 0o644));
    await atomicWrite(filePath, "updated");
    const stats = await stat(filePath);
    expect(stats.mode & 0o777).toBe(0o644);
  });

  it("creates parent directories when they do not exist", async () => {
    const filePath = join(tempDir, "nested", "deep", "file.json");
    await atomicWrite(filePath, "deep content");
    const content = await readFile(filePath, "utf8");
    expect(content).toBe("deep content");
  });

  it("writes empty content", async () => {
    const filePath = join(tempDir, "empty.txt");
    await atomicWrite(filePath, "");
    const content = await readFile(filePath, "utf8");
    expect(content).toBe("");
  });

  it("writes large content", async () => {
    const filePath = join(tempDir, "large.json");
    const largeContent = JSON.stringify({ data: "x".repeat(10000) });
    await atomicWrite(filePath, largeContent);
    const content = await readFile(filePath, "utf8");
    expect(content).toBe(largeContent);
  });

  it("writes Unicode content correctly", async () => {
    const filePath = join(tempDir, "unicode.json");
    const content = JSON.stringify({ name: "café", emoji: "🎉", greeting: "こんにちは" });
    await atomicWrite(filePath, content);
    const read = await readFile(filePath, "utf8");
    expect(read).toBe(content);
  });

  it("throws for an empty file path", async () => {
    await expect(atomicWrite("", "content")).rejects.toThrow(TypeError);
  });

  it("throws for non-string content", async () => {
    const filePath = join(tempDir, "bad-content.json");
    await expect(atomicWrite(filePath, 42 as unknown as string)).rejects.toThrow(TypeError);
  });

  it("leaves no temporary files after a successful write", async () => {
    const filePath = join(tempDir, "cleanup-test.json");
    await atomicWrite(filePath, "content");
    const dir = tempDir;
    const { readdir } = await import("node:fs/promises");
    const files = await readdir(dir);
    const tempFiles = files.filter((f) => f.includes(".tmp") || f.includes(".bak"));
    expect(tempFiles).toHaveLength(0);
  });

  it("is idempotent for the same content", async () => {
    const filePath = join(tempDir, "idempotent.json");
    await atomicWrite(filePath, "same content");
    const before = await stat(filePath);
    // Wait a bit to ensure mtime would change if written
    await new Promise((resolve) => setTimeout(resolve, 10));
    await atomicWrite(filePath, "same content");
    const after = await stat(filePath);
    // Content is the same, but atomicWrite always writes (no content comparison)
    expect(after.size).toBe(before.size);
  });
});
