import { randomBytes } from "node:crypto";
import { chmod, mkdir, open, rename, stat, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { normalizeFilePath } from "../utils/file-path";

/**
 * Writes UTF-8 text through a same-directory temporary file.
 * Preserves POSIX mode bits when the target already exists.
 */
export async function atomicWrite(
  filePath: string,
  content: string,
): Promise<void> {
  assertNonEmptyString(filePath, "filePath");

  if (typeof content !== "string") {
    throw new TypeError("[confedit] content must be a string.");
  }

  const targetPath = normalizeFilePath(filePath);
  const directoryPath = dirname(targetPath);
  const fileName = basename(targetPath);
  const nonce = `${process.pid}.${Date.now()}.${randomBytes(12).toString("hex")}`;

  const temporaryPath = join(directoryPath, `.${fileName}.${nonce}.tmp`);
  const backupPath = join(directoryPath, `.${fileName}.${nonce}.bak`);

  let temporaryHandle: Awaited<ReturnType<typeof open>> | undefined;
  let backupExists = false;
  let replacementSucceeded = false;

  try {
    await mkdir(directoryPath, { recursive: true });

    const originalMode = await readExistingMode(targetPath);

    temporaryHandle = await open(temporaryPath, "wx", originalMode ?? 0o600);

    try {
      await temporaryHandle.writeFile(content, "utf8");
      await temporaryHandle.sync();
    } finally {
      await temporaryHandle.close();
      temporaryHandle = undefined;
    }

    if (originalMode !== undefined) {
      await chmod(temporaryPath, originalMode);
    }

    try {
      await rename(temporaryPath, targetPath);
      replacementSucceeded = true;
    } catch (error) {
      if (!shouldUseWindowsReplacementFallback(error)) {
        throw error;
      }

      await rename(targetPath, backupPath);
      backupExists = true;

      try {
        await rename(temporaryPath, targetPath);
        replacementSucceeded = true;
      } catch (replacementError) {
        const restored = await restoreBackup(targetPath, backupPath);

        if (restored) {
          backupExists = false;
        }

        throw createError(
          restored
            ? `[confedit] Failed to replace "${targetPath}", but the original file was restored.`
            : `[confedit] Failed to replace "${targetPath}". The backup was retained at "${backupPath}".`,
          replacementError,
        );
      }
    }

    await syncDirectory(directoryPath);

    if (backupExists) {
      await unlink(backupPath);
      backupExists = false;
      await syncDirectory(directoryPath);
    }
  } catch (error) {
    if (temporaryHandle !== undefined) {
      await temporaryHandle.close().catch(() => undefined);
    }

    throw createError(
      `[confedit] Failed to atomically write "${filePath}": ${getErrorMessage(error)}`,
      error,
    );
  } finally {
    await unlink(temporaryPath).catch(() => undefined);

    // Preserve the backup if replacement failed and recovery also failed.
    if (replacementSucceeded && backupExists) {
      await unlink(backupPath).catch(() => undefined);
    }
  }
}

/**
 * Reads target permission bits when the file exists.
 */
async function readExistingMode(filePath: string): Promise<number | undefined> {
  try {
    return (await stat(filePath)).mode & 0o777;
  } catch (error) {
    if (getErrorCode(error) === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

/**
 * Uses backup replacement only for Windows replacement failures.
 */
function shouldUseWindowsReplacementFallback(error: unknown): boolean {
  if (process.platform !== "win32") {
    return false;
  }

  const code = getErrorCode(error);

  return code === "EEXIST" || code === "EPERM" || code === "EACCES";
}

/**
 * Restores the backup and reports whether restoration succeeded.
 */
async function restoreBackup(
  targetPath: string,
  backupPath: string,
): Promise<boolean> {
  try {
    await unlink(targetPath).catch((error: unknown) => {
      if (getErrorCode(error) !== "ENOENT") {
        throw error;
      }
    });

    await rename(backupPath, targetPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Flushes directory metadata when supported by the platform.
 */
async function syncDirectory(directoryPath: string): Promise<void> {
  let directoryHandle: Awaited<ReturnType<typeof open>> | undefined;

  try {
    directoryHandle = await open(directoryPath, "r");
    await directoryHandle.sync();
  } catch (error) {
    const code = getErrorCode(error);

    if (
      code !== "EINVAL" &&
      code !== "EPERM" &&
      code !== "EISDIR" &&
      code !== "ENOSYS" &&
      code !== "ENOTSUP"
    ) {
      throw error;
    }
  } finally {
    await directoryHandle?.close().catch(() => undefined);
  }
}

function assertNonEmptyString(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`[confedit] ${label} must be a non-empty string.`);
  }
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
    // Support older runtimes.
  }

  return error;
}
