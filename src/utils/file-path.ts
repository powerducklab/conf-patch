import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Converts a local path or file URL into an absolute native path.
 * Keeps valid whitespace and Unicode file names unchanged.
 */
export function normalizeFilePath(filePath: string): string {
  if (typeof filePath !== "string" || filePath.length === 0) {
    throw new TypeError("[confedit] filePath must be a non-empty string.");
  }

  if (filePath.startsWith("file:")) {
    try {
      return fileURLToPath(filePath);
    } catch (error) {
      throw createError(
        `[confedit] Invalid file URL "${filePath}": ${getErrorMessage(error)}`,
        error,
      );
    }
  }

  return isAbsolute(filePath) ? filePath : resolve(filePath);
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
