/**
 * @powerduck/conf-patch
 *
 * A production-grade configuration file editor with a clean two-layer architecture:
 *
 * 1. **Core layer** (browser-safe): Pure functions that patch JSON/JSONC/YAML strings.
 *    No filesystem access. Works in Node.js, Electron, and browsers.
 *    - patchContent, setContentValue, deleteContentValue
 *
 * 2. **File layer** (Node.js/Electron only): Functions that read/write files,
 *    combining the core layer with atomic writes and file locking.
 *    - readConfigFile, writeConfigFile, patchConfigFile, setConfigValue, deleteConfigValue
 *
 * @example
 * ```typescript
 * // Browser usage (no filesystem) — import from the core subpath
 * import { patchContent } from "@powerduck/conf-patch/core";
 * const updated = patchContent('{"name": "app"}', [{ op: "add", path: ["version"], value: "1.0.0" }], "json");
 *
 * // Node.js / Electron usage
 * import { setConfigValue } from "@powerduck/conf-patch";
 * await setConfigValue("config.yaml", ["database", "port"], 5432);
 * ```
 */

// ─── Core layer (browser-safe, no filesystem) ─────────────────────────────

export {
  patchContent,
  setContentValue,
  deleteContentValue,
  type PatchContentOptions,
} from "./core/patch";

export {
  assertNonEmptyString,
  assertPatchPath,
  assertPatchOperations,
  assertConfigFormat,
  getErrorMessage,
  createError,
} from "./core/validators";

// ─── File layer (Node.js / Electron only) ──────────────────────────────────

export { readConfigFile } from "./file/read";
export { writeConfigFile, type WriteConfigOptions } from "./file/write";
export {
  patchConfigFile,
  setConfigValue,
  deleteConfigValue,
} from "./file/patch";

export { withFileLock, releaseAllLocalLocks } from "./file/file-lock";

// ─── Types ──────────────────────────────────────────────────────────────────

export type {
  ConfigFormat,
  JsonPatchOp,
  JsonPathSegment,
  PatchConfigOptions,
  FileLockOptions,
} from "./types";

// ─── OpenAPI validation ─────────────────────────────────────────────────────

export type { AnyOpenAPIDocument } from "./utils/openapi-validate";
export {
  validateOpenAPISpec,
  validateOpenAPIFile,
  OpenApiValidationError,
  type ValidateOpenApiOptions,
  type OpenApiInputKind,
} from "./utils/openapi-validate";

// ─── Utilities ───────────────────────────────────────────────────────────────

export { detectFormat } from "./utils/format-detect";
export { normalizeFilePath } from "./utils/file-path";
