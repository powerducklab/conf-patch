import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { atomicWrite } from "./atomic-write";
import { withFileLock } from "./file-lock";
import { normalizeFilePath } from "../utils/file-path";
import { assertNonEmptyString, createError, getErrorMessage } from "../core/validators";

/**
 * Options for writing a configuration file.
 */
export interface WriteConfigOptions {
  /** Enable file locking during the write. Default: true */
  lock?: boolean;
  /** Maximum time (ms) to wait to acquire a file lock. */
  lockTimeoutMs?: number;
  /** Delay (ms) between retry attempts to acquire a lock. */
  lockRetryDelayMs?: number;
  /** Duration (ms) after which a lock is considered stale. */
  lockStaleThresholdMs?: number;
  /** Whether stale locks can be automatically reclaimed. */
  allowStaleRecovery?: boolean;
}

/**
 * Writes content to a configuration file using atomic writes and optional file locking.
 *
 * This function only works in Node.js / Electron environments.
 * For browser environments, use the core `patchContent` / `setContentValue`
 * functions and store the result in IndexedDB, localStorage, or another storage layer.
 *
 * @param filePath - Path to the configuration file
 * @param content - The content to write
 * @param options - Optional write settings
 * @throws If the file cannot be written
 *
 * @example
 * ```typescript
 * import { writeConfigFile } from "@powerduck/conf-patch";
 *
 * await writeConfigFile("config.json", '{"name": "app"}');
 * ```
 */
export async function writeConfigFile(
  filePath: string,
  content: string,
  options: WriteConfigOptions = {},
): Promise<void> {
  assertNonEmptyString(filePath, "filePath");

  if (typeof content !== "string") {
    throw new TypeError("[confedit] content must be a string.");
  }

  const absolutePath = normalizeFilePath(filePath);
  const lockEnabled = options.lock ?? true;

  const writeTransaction = async (): Promise<void> => {
    try {
      await atomicWrite(absolutePath, content);
    } catch (error) {
      throw createError(
        `[confedit] Failed to write "${filePath}": ${getErrorMessage(error)}`,
        error,
      );
    }
  };

  if (!lockEnabled) {
    await writeTransaction();
    return;
  }

  // Ensure parent directory exists before acquiring the lock file.
  await mkdir(dirname(absolutePath), { recursive: true });

  await withFileLock(absolutePath, writeTransaction, {
    timeoutMs: options.lockTimeoutMs,
    retryDelayMs: options.lockRetryDelayMs,
    staleThresholdMs: options.lockStaleThresholdMs,
    allowStaleRecovery: options.allowStaleRecovery,
  });
}
