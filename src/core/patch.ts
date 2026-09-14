import type { ConfigFormat, JsonPatchOp } from "../types";
import { patchJsonSource } from "../parsers/jsonc-patch";
import { patchYamlSource } from "../parsers/yaml-patch";
import {
  assertConfigFormat,
  assertPatchOperations,
  assertPatchPath,
} from "./validators";

/**
 * Options for content-level patch operations.
 * These do not involve file IO and work in both Node.js and browser environments.
 */
export interface PatchContentOptions {
  /** When true, failed operations throw. When false, they are skipped with a warning. Default: true */
  strict?: boolean;
}

/**
 * Applies RFC 6902 patch operations to a configuration string.
 *
 * This is a pure function that does not touch the filesystem.
 * It works in both Node.js and browser environments.
 *
 * @param content - The raw configuration content (JSON, JSONC, or YAML string)
 * @param ops - Array of RFC 6902 patch operations
 * @param format - The configuration format ("json" | "jsonc" | "yaml")
 * @param options - Optional patch settings
 * @returns The patched configuration content
 *
 * @example
 * ```typescript
 * import { patchContent } from "@powerduck/conf-patch";
 *
 * const updated = patchContent(
 *   '{"name": "app"}',
 *   [{ op: "add", path: ["version"], value: "1.0.0" }],
 *   "json",
 * );
 * // => '{\n  "name": "app",\n  "version": "1.0.0"\n}'
 * ```
 */
export function patchContent(
  content: string,
  ops: JsonPatchOp[],
  format: ConfigFormat,
  options: PatchContentOptions = {},
): string {
  if (typeof content !== "string") {
    throw new TypeError("[confedit] content must be a string.");
  }

  assertPatchOperations(ops);
  assertConfigFormat(format);

  if (ops.length === 0) {
    return content;
  }

  const strict = options.strict ?? true;

  switch (format) {
    case "json":
    case "jsonc":
      return patchJsonSource(content, ops, strict);
    case "yaml":
      return patchYamlSource(content, ops, strict);
  }
}

/**
 * Sets or creates a single value in a configuration string.
 *
 * Uses the `add` operation, which replaces existing object properties
 * or inserts at array indices (RFC 6902 behavior).
 *
 * This is a pure function that does not touch the filesystem.
 *
 * @param content - The raw configuration content
 * @param path - Segment path to the target key (e.g. ["server", "port"])
 * @param value - Value to set
 * @param format - The configuration format
 * @returns The updated configuration content
 *
 * @example
 * ```typescript
 * import { setContentValue } from "@powerduck/conf-patch";
 *
 * const updated = setContentValue(
 *   "name: app\n",
 *   ["version"],
 *   "1.0.0",
 *   "yaml",
 * );
 * ```
 */
export function setContentValue(
  content: string,
  path: readonly (string | number)[],
  value: unknown,
  format: ConfigFormat,
): string {
  assertPatchPath(path);

  return patchContent(
    content,
    [{ op: "add", path: [...path], value }],
    format,
  );
}

/**
 * Removes a key or array element from a configuration string.
 *
 * This is a pure function that does not touch the filesystem.
 *
 * @param content - The raw configuration content
 * @param path - Segment path to remove
 * @param format - The configuration format
 * @returns The updated configuration content
 *
 * @example
 * ```typescript
 * import { deleteContentValue } from "@powerduck/conf-patch";
 *
 * const updated = deleteContentValue(
 *   '{"name": "app", "legacy": true}',
 *   ["legacy"],
 *   "json",
 * );
 * ```
 */
export function deleteContentValue(
  content: string,
  path: readonly (string | number)[],
  format: ConfigFormat,
): string {
  assertPatchPath(path);

  return patchContent(content, [{ op: "remove", path: [...path] }], format);
}
