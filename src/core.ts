/**
 * @powerduck/conf-patch/core
 *
 * Browser-safe core layer. Pure functions for patching JSON, JSONC, and YAML strings.
 * No filesystem access. Works in Node.js, Electron, browsers, Edge Functions, or any JS environment.
 *
 * @example
 * ```typescript
 * import { patchContent, setContentValue, deleteContentValue } from "@powerduck/conf-patch/core";
 *
 * const updated = patchContent(
 *   '{"name": "app"}',
 *   [{ op: "add", path: ["version"], value: "1.0.0" }],
 *   "json",
 * );
 * ```
 */

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

export type {
  ConfigFormat,
  JsonPatchOp,
  JsonPathSegment,
} from "./types";
