import { randomBytes } from "node:crypto";
import { open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { normalizeFilePath } from "../utils/file-path";

export interface FileLockOptions {
  /** Maximum time to wait for a lock. Defaults to 10 seconds. */
  timeoutMs?: number;
  /** Initial retry delay. Defaults to 25ms. */
  retryDelayMs?: number;
  /** Explicit lock age after which recovery is allowed. */
  staleThresholdMs?: number;
  /**
   * Whether stale locks can be automatically reclaimed.
   * Disable by default for Electron single main process to avoid live transaction preemption.
   */
  allowStaleRecovery?: boolean;
}

interface LockData {
  version: 1;
  pid: number;
  hostname: string;
  createdAt: string;
  token: string;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRY_DELAY_MS = 25;
const MAX_RETRY_DELAY_MS = 1_000;
const DEFAULT_STALE_THRESHOLD_MS = 60_000;
const inProcessQueues = new Map<string, Promise<void>>();
const ownedLockPaths = new Set<string>();

/**
 * Runs work under a process-local queue and an exclusive lock file.
 *
 * A stale lock is recovered only when allowStaleRecovery = true and the lock exceeds staleThresholdMs.
 * PID checks are intentionally avoided: PIDs can be reused and cannot reliably identify the original process.
 */
export async function withFileLock<T>(
  filePath: string,
  callback: () => Promise<T>,
  options: FileLockOptions = {},
): Promise<T> {
  const absolutePath = normalizeFilePath(filePath);
  validateOptions(options);

  return queueInProcess(absolutePath, async () => {
    const release = await acquireLockFile(absolutePath, options);
    try {
      return await callback();
    } finally {
      await release();
    }
  });
}

/**
 * Release all locks owned by current process, designed for Electron app.will-quit
 */
export async function releaseAllLocalLocks(): Promise<void> {
  const tasks = Array.from(ownedLockPaths).map((lockPath) =>
    unlink(lockPath).catch(() => undefined),
  );
  await Promise.allSettled(tasks);
  ownedLockPaths.clear();
}

/**
 * Serializes work targeting the same file in this process.
 */
function queueInProcess<T>(
  absolutePath: string,
  callback: () => Promise<T>,
): Promise<T> {
  const previous = inProcessQueues.get(absolutePath) ?? Promise.resolve();
  let resolveCurrent!: () => void;
  const current = new Promise<void>((resolve) => {
    resolveCurrent = resolve;
  });
  const chain = previous.catch(() => undefined).then(() => current);
  inProcessQueues.set(absolutePath, chain);

  return previous
    .catch(() => undefined)
    .then(callback)
    .finally(() => {
      resolveCurrent();
      if (inProcessQueues.get(absolutePath) === chain) {
        inProcessQueues.delete(absolutePath);
      }
    });
}

/**
 * Acquires an exclusive lock file and returns an ownership-checked releaser.
 */
async function acquireLockFile(
  absolutePath: string,
  options: FileLockOptions,
): Promise<() => Promise<void>> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const staleThresholdMs =
    options.staleThresholdMs ??
    Math.max(timeoutMs * 2, DEFAULT_STALE_THRESHOLD_MS);
  const allowStaleRecovery = options.allowStaleRecovery ?? false;

  const lockPath = `${absolutePath}.confedit.lock`;
  const startedAt = Date.now();
  let delayMs = retryDelayMs;
  const token = createToken();

  const lockData: LockData = {
    version: 1,
    pid: process.pid,
    hostname: hostname(),
    createdAt: new Date().toISOString(),
    token,
  };

  while (true) {
    try {
      const handle = await open(lockPath, "wx", 0o600);
      try {
        await writeFile(handle, `${JSON.stringify(lockData)}\n`, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      ownedLockPaths.add(lockPath);
      return createReleaseHandler(lockPath, token);
    } catch (error) {
      if (getErrorCode(error) !== "EEXIST") {
        throw createError(
          `[confedit] Failed to acquire lock "${lockPath}": ${getErrorMessage(error)}`,
          error,
        );
      }

      // Skip stale recovery explicitly when disabled (Electron default)
      if (allowStaleRecovery) {
        await tryRecoverStaleLock(lockPath, staleThresholdMs);
      }

      if (Date.now() - startedAt >= timeoutMs) {
        throw new Error(
          `[confedit] Timed out waiting for lock on "${absolutePath}" after ${timeoutMs}ms.`,
        );
      }

      await sleep(delayMs);
      delayMs = Math.min(Math.ceil(delayMs * 1.5), MAX_RETRY_DELAY_MS);
    }
  }
}

/**
 * Deletes a lock only when its token still belongs to this caller.
 */
function createReleaseHandler(
  lockPath: string,
  token: string,
): () => Promise<void> {
  return async () => {
    try {
      const data = await readLockData(lockPath);
      if (data?.token === token) {
        await unlink(lockPath).catch(() => undefined);
        ownedLockPaths.delete(lockPath);
      }
    } catch {
      // Release logic must never throw to avoid masking upstream callback errors
    }
  };
}

/**
 * Isolates an expired lock before deleting it.
 * The rename prevents deleting a newly acquired replacement lock by name.
 */
async function tryRecoverStaleLock(
  lockPath: string,
  staleThresholdMs: number,
): Promise<void> {
  const data = await readLockData(lockPath);
  if (data === undefined || !isExpiredLock(data, staleThresholdMs)) {
    return;
  }
  const quarantinePath = `${lockPath}.stale.${createToken()}`;
  try {
    await rename(lockPath, quarantinePath);
  } catch (error) {
    if (getErrorCode(error) === "ENOENT") {
      return;
    }
    return;
  }
  try {
    const quarantinedData = await readLockData(quarantinePath);
    if (
      quarantinedData?.token === data.token &&
      isExpiredLock(quarantinedData, staleThresholdMs)
    ) {
      await unlink(quarantinePath).catch(() => undefined);
      return;
    }
    // Do not discard a lock that changed during recovery
    await rename(quarantinePath, lockPath).catch(() => undefined);
  } catch {
    // Preserve quarantined stale file for manual inspection on unexpected failures
  }
}

/**
 * Returns true only when the lock exceeded its configured age limit.
 */
function isExpiredLock(data: LockData, staleThresholdMs: number): boolean {
  const createdAtMs = Date.parse(data.createdAt);
  return (
    Number.isFinite(createdAtMs) && Date.now() - createdAtMs > staleThresholdMs
  );
}

/**
 * Reads and validates lock data. Invalid locks are not auto-deleted.
 */
async function readLockData(lockPath: string): Promise<LockData | undefined> {
  try {
    const content = await readFile(lockPath, "utf8");
    return parseLockData(content);
  } catch {
    return undefined;
  }
}

function parseLockData(content: string): LockData | undefined {
  try {
    const value = JSON.parse(content) as Partial<LockData>;
    if (
      value.version !== 1 ||
      typeof value.pid !== "number" ||
      !Number.isSafeInteger(value.pid) ||
      value.pid <= 0 ||
      typeof value.hostname !== "string" ||
      typeof value.createdAt !== "string" ||
      !Number.isFinite(Date.parse(value.createdAt)) ||
      typeof value.token !== "string" ||
      value.token.length < 16
    ) {
      return undefined;
    }
    return {
      version: 1,
      pid: value.pid,
      hostname: value.hostname,
      createdAt: value.createdAt,
      token: value.token,
    };
  } catch {
    return undefined;
  }
}

function validateOptions(options: FileLockOptions): void {
  if (
    options.timeoutMs !== undefined &&
    (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 0)
  ) {
    throw new TypeError(
      "[confedit] lock timeoutMs must be a non-negative finite number.",
    );
  }
  if (
    options.retryDelayMs !== undefined &&
    (!Number.isFinite(options.retryDelayMs) || options.retryDelayMs <= 0)
  ) {
    throw new TypeError(
      "[confedit] lock retryDelayMs must be a positive finite number.",
    );
  }
  if (
    options.staleThresholdMs !== undefined &&
    (!Number.isFinite(options.staleThresholdMs) ||
      options.staleThresholdMs <= 0)
  ) {
    throw new TypeError(
      "[confedit] lock staleThresholdMs must be a positive finite number.",
    );
  }
}

function createToken(): string {
  return `${process.pid}-${Date.now()}-${randomBytes(16).toString("hex")}`;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function getErrorCode(error: unknown): string | undefined {
  if (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return undefined;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createError(message: string, cause: unknown): Error {
  const error = new Error(message);
  try {
    Object.defineProperty(error, "cause", {
      configurable: true,
      enumerable: false,
      value: cause,
      writable: true,
    });
  } catch {
    // Gracefully support older Node.js runtimes
  }
  return error;
}
