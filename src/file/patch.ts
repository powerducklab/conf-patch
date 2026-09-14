import type { ConfigFormat, JsonPatchOp, PatchConfigOptions } from "../types";
import { patchContent } from "../core/patch";
import {
  assertConfigFormat,
  assertPatchOperations,
  createError,
  getErrorMessage,
} from "../core/validators";
import { readConfigFile } from "./read";
import { atomicWrite } from "./atomic-write";
import { withFileLock } from "./file-lock";
import { detectFormat } from "../utils/format-detect";
import { normalizeFilePath } from "../utils/file-path";

/**
 * Asserts that lock options in PatchConfigOptions are valid.
 */
function assertLockOptions(options: PatchConfigOptions): void {
  if (
    options.lockTimeoutMs !== undefined &&
    (!Number.isFinite(options.lockTimeoutMs) || options.lockTimeoutMs < 0)
  ) {
    throw new TypeError(
      "[confedit] lockTimeoutMs must be a non-negative finite number.",
    );
  }

  if (
    options.lockRetryDelayMs !== undefined &&
    (!Number.isFinite(options.lockRetryDelayMs) ||
      options.lockRetryDelayMs <= 0)
  ) {
    throw new TypeError(
      "[confedit] lockRetryDelayMs must be a positive finite number.",
    );
  }

  if (
    options.lockStaleThresholdMs !== undefined &&
    (!Number.isFinite(options.lockStaleThresholdMs) ||
      options.lockStaleThresholdMs <= 0)
  ) {
    throw new TypeError(
      "[confedit] lockStaleThresholdMs must be a positive finite number.",
    );
  }
}

/**
 * Patches a JSON, JSONC, or YAML file using an atomic locked transaction.
 *
 * This function only works in Node.js / Electron environments.
 * For browser environments, use `patchContent` directly and manage storage yourself.
 *
 * @param filePath - Path to the configuration file
 * @param ops - Array of RFC 6902 patch operations
 * @param options - Optional patch settings
 *
 * @example
 * ```typescript
 * import { patchConfigFile } from "@powerduck/conf-patch";
 *
 * await patchConfigFile("config.json", [
 *   { op: "replace", path: ["server", "host"], value: "0.0.0.0" },
 *   { op: "add", path: ["server", "ssl"], value: true },
 *   { op: "remove", path: ["legacySection"] },
 * ]);
 * ```
 */
export async function patchConfigFile(
  filePath: string,
  ops: JsonPatchOp[],
  options: PatchConfigOptions = {},
): Promise<void> {
  if (typeof filePath !== "string" || filePath.length === 0) {
    throw new TypeError("[confedit] filePath must be a non-empty string.");
  }

  assertPatchOperations(ops);

  if (ops.length === 0) {
    return;
  }

  const absolutePath = normalizeFilePath(filePath);
  const format: ConfigFormat = options.format ?? detectFormat(absolutePath);

  assertConfigFormat(format);
  assertLockOptions(options);

  const strict = options.strict ?? true;
  const lockEnabled = options.lock ?? true;

  const patchTransaction = async (): Promise<void> => {
    // Read the current content inside the lock to prevent concurrent reads
    const rawSource = await readConfigFile(absolutePath);

    // Apply patches using the pure core function
    const patchedSource = patchContent(rawSource, ops, format, { strict });

    // Write back only if content changed
    if (patchedSource !== rawSource) {
      try {
        await atomicWrite(absolutePath, patchedSource);
      } catch (error) {
        throw createError(
          `[confedit] Failed to write "${filePath}": ${getErrorMessage(error)}`,
          error,
        );
      }
    }
  };

  if (!lockEnabled) {
    await patchTransaction();
    return;
  }

  await withFileLock(absolutePath, patchTransaction, {
    timeoutMs: options.lockTimeoutMs,
    retryDelayMs: options.lockRetryDelayMs,
    staleThresholdMs: options.lockStaleThresholdMs,
    allowStaleRecovery: options.allowStaleRecovery,
  });
}

/**
 * Adds or replaces a nested configuration value in a file.
 *
 * Uses the `add` operation, which replaces existing object properties
 * or inserts at array indices (RFC 6902 behavior).
 *
 * This function only works in Node.js / Electron environments.
 *
 * @param filePath - Path to the configuration file
 * @param path - Segment path to the target key
 * @param value - Value to set
 * @param options - Optional patch settings
 *
 * @example
 * ```typescript
 * import { setConfigValue } from "@powerduck/conf-patch";
 *
 * await setConfigValue("config.yaml", ["database", "port"], 5432);
 * ```
 */
export async function setConfigValue(
  filePath: string,
  path: readonly (string | number)[],
  value: unknown,
  options: PatchConfigOptions = {},
): Promise<void> {
  await patchConfigFile(
    filePath,
    [{ op: "add", path: [...path], value }],
    options,
  );
}

/**
 * Removes an existing nested configuration value from a file.
 *
 * This function only works in Node.js / Electron environments.
 *
 * @param filePath - Path to the configuration file
 * @param path - Segment path to remove
 * @param options - Optional patch settings
 *
 * @example
 * ```typescript
 * import { deleteConfigValue } from "@powerduck/conf-patch";
 *
 * await deleteConfigValue("config.json", ["features", "betaPreview"]);
 * ```
 */
export async function deleteConfigValue(
  filePath: string,
  path: readonly (string | number)[],
  options: PatchConfigOptions = {},
): Promise<void> {
  await patchConfigFile(filePath, [{ op: "remove", path: [...path] }], options);
}
