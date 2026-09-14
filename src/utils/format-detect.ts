import { extname } from "node:path";
import type { ConfigFormat } from "../types";
import { normalizeFilePath } from "./file-path";

/**
 * Detects a supported configuration format from a local file path or file URL.
 */
export function detectFormat(filePath: string): ConfigFormat {
  const normalizedPath = normalizeFilePath(filePath);

  switch (extname(normalizedPath).toLowerCase()) {
    case ".json":
      return "json";
    case ".jsonc":
      return "jsonc";
    case ".yaml":
    case ".yml":
      return "yaml";
    default:
      throw new Error(
        `[confedit] Cannot detect a supported configuration format for "${filePath}". ` +
          "Expected .json, .jsonc, .yaml, or .yml.",
      );
  }
}
