import { readFile } from "node:fs/promises";
import { normalizeFilePath } from "../utils/file-path";
import { assertNonEmptyString, createError, getErrorMessage } from "../core/validators";

/**
 * Reads UTF-8 text from a local file path or file URL.
 *
 * This function only works in Node.js / Electron environments.
 * For browser environments, use the core `patchContent` / `setContentValue`
 * functions directly with string content.
 *
 * @param filePath - Path to the configuration file (absolute, relative, or file:// URL)
 * @returns The raw UTF-8 content of the file
 * @throws If the file cannot be read
 */
export async function readConfigFile(filePath: string): Promise<string> {
  assertNonEmptyString(filePath, "filePath");

  const absolutePath = normalizeFilePath(filePath);

  try {
    return await readFile(absolutePath, "utf8");
  } catch (error) {
    throw createError(
      `[confedit] Failed to read "${filePath}": ${getErrorMessage(error)}`,
      error,
    );
  }
}
