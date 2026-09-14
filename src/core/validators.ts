import type { ConfigFormat, JsonPatchOp } from "../types";

/**
 * Asserts that a value is a non-empty string.
 */
export function assertNonEmptyString(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`[confedit] ${label} must be a non-empty string.`);
  }
}

/**
 * Asserts that a patch path is a non-empty array of valid segments.
 */
export function assertPatchPath(
  path: readonly (string | number)[],
  label = "path",
): void {
  if (!Array.isArray(path) || path.length === 0) {
    throw new TypeError(`[confedit] ${label} must be a non-empty array.`);
  }

  for (const [index, segment] of path.entries()) {
    if (typeof segment === "string") {
      if (segment.length === 0) {
        throw new TypeError(
          `[confedit] ${label}[${index}] must not be an empty string.`,
        );
      }
      continue;
    }

    if (
      typeof segment !== "number" ||
      !Number.isSafeInteger(segment) ||
      segment < 0
    ) {
      throw new TypeError(
        `[confedit] ${label}[${index}] must be a non-empty string or a non-negative integer.`,
      );
    }
  }
}

/**
 * Asserts that an array of patch operations is valid.
 */
export function assertPatchOperations(ops: JsonPatchOp[]): void {
  if (!Array.isArray(ops)) {
    throw new TypeError("[confedit] ops must be an array.");
  }

  for (const [index, operation] of ops.entries()) {
    if (operation === null || typeof operation !== "object") {
      throw new TypeError(
        `[confedit] Patch operation at index ${index} must be an object.`,
      );
    }

    if (
      operation.op !== "add" &&
      operation.op !== "replace" &&
      operation.op !== "remove"
    ) {
      throw new Error(
        `[confedit] Unsupported patch operation at index ${index}: ${String(operation.op)}.`,
      );
    }

    assertPatchPath(operation.path, `ops[${index}].path`);

    if (
      (operation.op === "add" || operation.op === "replace") &&
      !Object.prototype.hasOwnProperty.call(operation, "value")
    ) {
      throw new TypeError(
        `[confedit] Patch operation at index ${index} requires a value.`,
      );
    }
  }
}

/**
 * Asserts that a config format is supported.
 */
export function assertConfigFormat(format: ConfigFormat): void {
  if (format !== "json" && format !== "jsonc" && format !== "yaml") {
    throw new Error(
      `[confedit] Unsupported configuration format: ${String(format)}.`,
    );
  }
}

/**
 * Extracts a human-readable error message from an unknown error.
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Creates an Error with an optional cause, preserving compatibility with older runtimes.
 */
export function createError(message: string, cause: unknown): Error {
  const error = new Error(message);

  try {
    Object.defineProperty(error, "cause", {
      configurable: true,
      enumerable: false,
      value: cause,
      writable: true,
    });
  } catch {
    // Preserve compatibility with older runtimes.
  }

  return error;
}
