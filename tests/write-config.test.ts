import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, readFile, writeFile, stat, rm, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { writeConfigFile } from "../src/file/write";

const mkdtempAsync = promisify(mkdtemp);
const readFileAsync = promisify(readFile);
const writeFileAsync = promisify(writeFile);
const rmAsync = promisify(rm);

let tempDir: string;

beforeAll(async () => {
  tempDir = await mkdtempAsync(join(tmpdir(), "confedit-write-"));
});

afterAll(async () => {
  await rmAsync(tempDir, { recursive: true, force: true });
});

describe("writeConfigFile", () => {
  it("writes content to a new file", async () => {
    const filePath = join(tempDir, "new-file.json");
    await writeConfigFile(filePath, '{"name":"test"}');
    const content = await readFileAsync(filePath, "utf8");
    expect(content).toBe('{"name":"test"}');
  });

  it("overwrites an existing file", async () => {
    const filePath = join(tempDir, "existing.json");
    await writeFileAsync(filePath, "old content", "utf8");
    await writeConfigFile(filePath, "new content");
    const content = await readFileAsync(filePath, "utf8");
    expect(content).toBe("new content");
  });

  it("writes empty content", async () => {
    const filePath = join(tempDir, "empty.txt");
    await writeConfigFile(filePath, "");
    const content = await readFileAsync(filePath, "utf8");
    expect(content).toBe("");
  });

  it("writes large content", async () => {
    const filePath = join(tempDir, "large.json");
    const largeContent = JSON.stringify({ data: "x".repeat(10000) });
    await writeConfigFile(filePath, largeContent);
    const content = await readFileAsync(filePath, "utf8");
    expect(content).toBe(largeContent);
  });

  it("writes Unicode content correctly", async () => {
    const filePath = join(tempDir, "unicode.json");
    const content = JSON.stringify({ name: "café", emoji: "🎉" });
    await writeConfigFile(filePath, content);
    const read = await readFileAsync(filePath, "utf8");
    expect(read).toBe(content);
  });

  it("creates parent directories when they do not exist", async () => {
    const filePath = join(tempDir, "nested", "deep", "file.json");
    await writeConfigFile(filePath, "deep content");
    const content = await readFileAsync(filePath, "utf8");
    expect(content).toBe("deep content");
  });

  it("supports disabling file locking", async () => {
    const filePath = join(tempDir, "no-lock.json");
    await writeConfigFile(filePath, '{"name":"test"}', { lock: false });
    const content = await readFileAsync(filePath, "utf8");
    expect(content).toBe('{"name":"test"}');
  });

  it("throws for an empty file path", async () => {
    await expect(writeConfigFile("", "content")).rejects.toThrow(TypeError);
  });

  it("throws for non-string content", async () => {
    const filePath = join(tempDir, "bad-content.json");
    await expect(writeConfigFile(filePath, 42 as unknown as string)).rejects.toThrow(
      TypeError,
    );
  });

  it("throws for invalid lock options", async () => {
    const filePath = join(tempDir, "bad-lock.json");
    await expect(
      writeConfigFile(filePath, "content", { lockTimeoutMs: -1 }),
    ).rejects.toThrow(TypeError);
  });

  it("leaves no temporary files after a successful write", async () => {
    const filePath = join(tempDir, "cleanup-test.json");
    await writeConfigFile(filePath, "content");
    const { readdir } = await import("node:fs/promises");
    const files = await readdir(tempDir);
    const tempFiles = files.filter((f) => f.includes(".tmp") || f.includes(".bak"));
    expect(tempFiles).toHaveLength(0);
  });

  it("is atomic — does not corrupt the file on concurrent writes", async () => {
    const filePath = join(tempDir, "concurrent-write.json");
    await writeConfigFile(filePath, JSON.stringify({ count: 0 }));

    const writes = Array.from({ length: 5 }, (_, i) =>
      writeConfigFile(filePath, JSON.stringify({ count: i })),
    );

    await Promise.all(writes);

    // File should still be valid JSON
    const content = await readFileAsync(filePath, "utf8");
    expect(() => JSON.parse(content)).not.toThrow();
  });
});
