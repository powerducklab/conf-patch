import {
  applyEdits,
  findNodeAtLocation,
  modify,
  parseTree,
} from "jsonc-parser";
import type { JsonPatchOp, JsonPathSegment } from "../types";

const FORMATTING_OPTIONS = {
  insertSpaces: true,
  tabSize: 2,
  eol: "\n",
} as const;

/**
 * Applies RFC 6902 patch operations to JSON or JSONC source text.
 */
export function patchJsonSource(
  sourceText: string,
  ops: JsonPatchOp[],
  strict = true,
): string {
  if (typeof sourceText !== "string") {
    throw new TypeError("[confedit] sourceText must be a string.");
  }
  if (!Array.isArray(ops)) {
    throw new TypeError("[confedit] ops must be an array.");
  }

  let text = sourceText;
  for (const op of ops) {
    try {
      validateOperation(op);
      const path = normalizePath(op.path);
      switch (op.op) {
        case "add":
          text = applyAdd(text, path, op.value);
          break;
        case "replace":
          text = applyReplace(text, path, op.value);
          break;
        case "remove":
          text = applyRemove(text, path);
          break;
        default:
          throw new Error(
            `[confedit] Unsupported JSON patch operation: ${String(op.op)}`,
          );
      }
    } catch (error) {
      const message = `[confedit] Failed to apply JSON patch ${safeStringify(op)}: ${getErrorMessage(error)}`;
      if (strict) {
        throw createError(message, error);
      }
      console.warn(message);
    }
  }
  return text;
}

function validateOperation(op: JsonPatchOp): void {
  if (op === null || typeof op !== "object") {
    throw new TypeError("Patch operation must be an object.");
  }
  if (!Array.isArray(op.path) || op.path.length === 0) {
    throw new Error("Patch operation path must be a non-empty array.");
  }
  if (op.op !== "add" && op.op !== "replace" && op.op !== "remove") {
    throw new Error(`Unsupported JSON patch operation: ${String(op.op)}`);
  }
  if (
    (op.op === "add" || op.op === "replace") &&
    !Object.prototype.hasOwnProperty.call(op, "value")
  ) {
    throw new Error(`Patch operation "${op.op}" requires a value.`);
  }
}

function normalizePath(path: readonly JsonPathSegment[]): JsonPathSegment[] {
  return path.map((segment) => {
    if (typeof segment === "number") {
      if (!Number.isSafeInteger(segment) || segment < 0) {
        throw new Error(`Invalid array index: ${segment}`);
      }
      return segment;
    }
    if (typeof segment !== "string") {
      throw new TypeError(
        `Patch path segments must be strings or numbers; received ${typeof segment}.`,
      );
    }
    return segment;
  });
}

function applyAdd(
  sourceText: string,
  path: JsonPathSegment[],
  value: unknown,
): string {
  const tree = getTree(sourceText);
  const parent = getParentNode(tree, path);
  const lastSegment = path[path.length - 1];

  if (parent.type === "array") {
    const index = requireArrayIndex(lastSegment, path);
    const arrayLength = parent.children?.length ?? 0;
    if (index > arrayLength) {
      throw new Error(
        `Cannot add at array index ${index}; array length is ${arrayLength} at path: ${formatPath(path.slice(0, -1))}`,
      );
    }
    return applyModify(sourceText, path, value, true);
  }

  if (parent.type === "object") {
    if (typeof lastSegment !== "string") {
      throw new Error(
        `Object property path segment must be a string at path: ${formatPath(path)}`,
      );
    }
    return applyModify(sourceText, path, value, false);
  }

  throw new Error(
    `Cannot add a child to non-container value at path: ${formatPath(path.slice(0, -1))}`,
  );
}

function applyReplace(
  sourceText: string,
  path: JsonPathSegment[],
  value: unknown,
): string {
  const tree = getTree(sourceText);
  const target = findNodeAtLocation(tree, path);
  if (target === undefined) {
    throw new Error(
      `Cannot replace a value that does not exist at path: ${formatPath(path)}`,
    );
  }
  return applyModify(sourceText, path, value, false);
}

function applyRemove(sourceText: string, path: JsonPathSegment[]): string {
  const tree = getTree(sourceText);
  const target = findNodeAtLocation(tree, path);
  if (target === undefined) {
    throw new Error(
      `Cannot remove a value that does not exist at path: ${formatPath(path)}`,
    );
  }
  return applyModify(sourceText, path, undefined, false);
}

function applyModify(
  sourceText: string,
  path: JsonPathSegment[],
  value: unknown,
  isArrayInsertion: boolean,
): string {
  const edits = modify(sourceText, path, value, {
    formattingOptions: FORMATTING_OPTIONS,
    isArrayInsertion,
  });
  if (edits.length === 0) {
    throw new Error(
      `No JSONC edit was generated for path: ${formatPath(path)}`,
    );
  }
  return applyEdits(sourceText, edits);
}

function getTree(sourceText: string) {
  const errors: Array<{ error: number; offset: number; length: number }> = [];
  const tree = parseTree(sourceText, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  });
  if (tree === undefined || errors.length > 0) {
    throw new Error(
      `The source text is not valid JSON or JSONC${formatParseErrors(errors)}.`,
    );
  }
  return tree;
}

function getParentNode(
  tree: NonNullable<ReturnType<typeof parseTree>>,
  path: JsonPathSegment[],
): NonNullable<ReturnType<typeof parseTree>> {
  if (path.length === 1) {
    if (tree.type !== "object" && tree.type !== "array") {
      throw new Error("Cannot add a root child to a scalar JSON value.");
    }
    return tree;
  }
  const parentPath = path.slice(0, -1);
  const parent = findNodeAtLocation(tree, parentPath);
  if (parent === undefined) {
    throw new Error(
      `Cannot add value because its parent does not exist at path: ${formatPath(parentPath)}`,
    );
  }
  if (parent.type !== "object" && parent.type !== "array") {
    throw new Error(
      `Cannot add value because its parent is not an object or array at path: ${formatPath(parentPath)}`,
    );
  }
  return parent;
}

function requireArrayIndex(
  segment: JsonPathSegment,
  path: readonly JsonPathSegment[],
): number {
  if (typeof segment !== "number") {
    throw new Error(
      `Array index must be a number at path: ${formatPath(path)}`,
    );
  }
  if (!Number.isSafeInteger(segment) || segment < 0) {
    throw new Error(
      `Invalid array index ${segment} at path: ${formatPath(path)}`,
    );
  }
  return segment;
}

function formatParseErrors(
  errors: Array<{ error: number; offset: number; length: number }>,
): string {
  if (errors.length === 0) {
    return "";
  }
  return ` (parse errors: ${errors.map((item) => `code=${item.error}, offset=${item.offset}`).join("; ")})`;
}

function formatPath(path: readonly JsonPathSegment[]): string {
  return `[${path.map((segment) => JSON.stringify(segment)).join(", ")}]`;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable patch operation]";
  }
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
    // Fallback for older JS runtimes
  }
  return error;
}
