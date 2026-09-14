import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, readFile, writeFile, rm, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { withFileLock, releaseAllLocalLocks } from "../src/file/file-lock.js";

const mkdtempAsync = promisify(mkdtemp);
const readFileAsync = promisify(readFile);
const writeFileAsync = promisify(writeFile);
const rmAsync = promisify(rm);

let tempDir: string;

beforeAll(async () => {
  tempDir = await mkdtempAsync(join(tmpdir(), "confedit-lock-"));
});

afterAll(async () => {
  await releaseAllLocalLocks();
  await rmAsync(tempDir, { recursive: true, force: true });
});

describe("withFileLock", () => {
  it("executes the callback and returns its result", async () => {
    const filePath = join(tempDir, "simple.json");
    const result = await withFileLock(filePath, async () => {
      return "callback result";
    });
    expect(result).toBe("callback result");
  });

  it("creates a lock file during execution", async () => {
    const filePath = join(tempDir, "lock-during.json");
    let lockPathDuringExecution: string | null = null;

    await withFileLock(filePath, async () => {
      lockPathDuringExecution = `${filePath}.confedit.lock`;
      expect(existsSync(lockPathDuringExecution)).toBe(true);
    });

    // Lock should be released after callback
    expect(existsSync(lockPathDuringExecution!)).toBe(false);
  });

  it("removes the lock file after the callback completes", async () => {
    const filePath = join(tempDir, "cleanup.json");
    await withFileLock(filePath, async () => {
      // Do nothing
    });
    expect(existsSync(`${filePath}.confedit.lock`)).toBe(false);
  });

  it("removes the lock file after the callback throws", async () => {
    const filePath = join(tempDir, "throw-cleanup.json");
    await expect(
      withFileLock(filePath, async () => {
        throw new Error("callback failed");
      }),
    ).rejects.toThrow("callback failed");
    expect(existsSync(`${filePath}.confedit.lock`)).toBe(false);
  });

  it("serializes concurrent access to the same file", async () => {
    const filePath = join(tempDir, "concurrent.json");
    const order: number[] = [];

    const task1 = withFileLock(filePath, async () => {
      order.push(1);
      await new Promise((resolve) => setTimeout(resolve, 50));
      order.push(2);
    });

    const task2 = withFileLock(filePath, async () => {
      order.push(3);
      await new Promise((resolve) => setTimeout(resolve, 50));
      order.push(4);
    });

    await Promise.all([task1, task2]);
    expect(order).toEqual([1, 2, 3, 4]);
  });

  it("allows concurrent access to different files", async () => {
    const file1 = join(tempDir, "diff1.json");
    const file2 = join(tempDir, "diff2.json");
    const order: string[] = [];

    const task1 = withFileLock(file1, async () => {
      order.push("task1-start");
      await new Promise((resolve) => setTimeout(resolve, 100));
      order.push("task1-end");
    });

    // Wait for task1 to start, then start task2
    await new Promise((resolve) => setTimeout(resolve, 20));

    const task2 = withFileLock(file2, async () => {
      order.push("task2-start");
      await new Promise((resolve) => setTimeout(resolve, 50));
      order.push("task2-end");
    });

    await Promise.all([task1, task2]);
    // task2 should start and end before task1 ends (different files, no locking)
    expect(order.indexOf("task2-end")).toBeLessThan(order.indexOf("task1-end"));
  });

  it("times out when the lock file is held externally", async () => {
    const filePath = join(tempDir, "external-timeout.json");
    const lockPath = `${filePath}.confedit.lock`;

    // Manually create a lock file to simulate another process holding the lock
    await writeFileAsync(
      lockPath,
      JSON.stringify({
        version: 1,
        pid: 99999,
        hostname: "other-host",
        createdAt: new Date().toISOString(),
        token: "external-lock-token",
      }),
      "utf8",
    );

    try {
      await expect(
        withFileLock(
          filePath,
          async () => {
            // Should not reach here
          },
          { timeoutMs: 200, retryDelayMs: 50 },
        ),
      ).rejects.toThrow(/timed out/i);
    } finally {
      // Clean up the external lock file
      await rmAsync(lockPath, { force: true });
    }
  });

  it("supports custom retry delay", async () => {
    const filePath = join(tempDir, "retry-delay.json");
    const startTime = Date.now();

    const holdLock = withFileLock(filePath, async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    await withFileLock(
      filePath,
      async () => {
        // Acquired after first lock released
      },
      { timeoutMs: 1000, retryDelayMs: 50 },
    );

    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeGreaterThanOrEqual(150);
    await holdLock;
  });

  it("validates timeoutMs option", async () => {
    const filePath = join(tempDir, "bad-timeout.json");
    await expect(
      withFileLock(filePath, async () => {}, { timeoutMs: -1 }),
    ).rejects.toThrow(TypeError);
  });

  it("validates retryDelayMs option", async () => {
    const filePath = join(tempDir, "bad-retry.json");
    await expect(
      withFileLock(filePath, async () => {}, { retryDelayMs: 0 }),
    ).rejects.toThrow(TypeError);
  });

  it("validates staleThresholdMs option", async () => {
    const filePath = join(tempDir, "bad-stale.json");
    await expect(
      withFileLock(filePath, async () => {}, { staleThresholdMs: 0 }),
    ).rejects.toThrow(TypeError);
  });
});

describe("releaseAllLocalLocks", () => {
  it("releases all locks owned by the current process", async () => {
    const file1 = join(tempDir, "release1.json");
    const file2 = join(tempDir, "release2.json");

    await withFileLock(file1, async () => {
      await withFileLock(file2, async () => {
        // Both locks held
      });
    });

    // Locks should already be released, but call releaseAllLocalLocks to be safe
    await releaseAllLocalLocks();

    expect(existsSync(`${file1}.confedit.lock`)).toBe(false);
    expect(existsSync(`${file2}.confedit.lock`)).toBe(false);
  });
});
