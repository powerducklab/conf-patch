import {
  Document,
  isMap,
  isSeq,
  parseDocument,
  type Node,
  type YAMLMap,
  type YAMLSeq,
} from "yaml";
import type { JsonPatchOp, JsonPathSegment } from "../types";

/**
 * Applies RFC 6902 patch operations to YAML source text while preserving structure.
 */
export function patchYamlSource(
  sourceText: string,
  ops: JsonPatchOp[],
  strict = true,
): string {
  const document = parseDocument(sourceText, {
    prettyErrors: true,
    strict: true,
  });

  if (document.errors.length > 0) {
    throw new Error(
      `[confedit] Invalid YAML source: ${document.errors.map((e) => e.message).join("; ")}`,
    );
  }

  for (const operation of ops) {
    try {
      applyYamlOperation(document, operation);
    } catch (error) {
      if (strict) {
        throw error;
      }
      console.warn(
        `[confedit yaml patch warn] Skip operation ${JSON.stringify(operation)}`,
        error,
      );
    }
  }

  return document.toString();
}

function applyYamlOperation(document: Document, operation: JsonPatchOp): void {
  validateOperation(operation);
  const path = operation.path;
  const parent = getExistingParent(document, path);
  const key = path[path.length - 1];

  if (isMap(parent)) {
    applyMapOperation(document, parent, key, operation);
    return;
  }
  if (isSeq(parent)) {
    applySequenceOperation(document, parent, key, operation);
    return;
  }
  throw new Error(
    `[confedit] Cannot apply patch at ${formatPath(path)} because its parent is not a YAML map or sequence.`,
  );
}

function applyMapOperation(
  document: Document,
  parent: YAMLMap,
  key: JsonPathSegment,
  operation: JsonPatchOp,
): void {
  if (typeof key !== "string") {
    throw new Error(
      `[confedit] YAML map keys must be strings at ${formatPath(operation.path)}.`,
    );
  }
  const exists = parent.has(key);
  switch (operation.op) {
    case "add":
      parent.set(key, document.createNode(operation.value));
      return;
    case "replace":
      if (!exists) {
        throw new Error(
          `[confedit] Cannot replace missing value at ${formatPath(operation.path)}.`,
        );
      }
      parent.set(key, document.createNode(operation.value));
      return;
    case "remove":
      if (!exists) {
        throw new Error(
          `[confedit] Cannot remove missing value at ${formatPath(operation.path)}.`,
        );
      }
      parent.delete(key);
      return;
    default:
      throw new Error(
        `[confedit] Unsupported patch operation: ${String(operation.op)}.`,
      );
  }
}

function applySequenceOperation(
  document: Document,
  parent: YAMLSeq,
  key: JsonPathSegment,
  operation: JsonPatchOp,
): void {
  if (typeof key !== "number" || !Number.isSafeInteger(key) || key < 0) {
    throw new Error(
      `[confedit] YAML sequence indexes must be non-negative integers at ${formatPath(operation.path)}.`,
    );
  }
  const length = parent.items.length;
  switch (operation.op) {
    case "add":
      if (key > length) {
        throw new Error(
          `[confedit] Cannot insert at index ${key}; sequence length is ${length}.`,
        );
      }
      parent.items.splice(key, 0, document.createNode(operation.value));
      return;
    case "replace":
      if (key >= length) {
        throw new Error(
          `[confedit] Cannot replace index ${key}; sequence length is ${length}.`,
        );
      }
      parent.items[key] = document.createNode(operation.value);
      return;
    case "remove":
      if (key >= length) {
        throw new Error(
          `[confedit] Cannot remove index ${key}; sequence length is ${length}.`,
        );
      }
      parent.items.splice(key, 1);
      return;
    default:
      throw new Error(
        `[confedit] Unsupported patch operation: ${String(operation.op)}.`,
      );
  }
}

function getExistingParent(
  document: Document,
  path: readonly JsonPathSegment[],
): Node {
  if (path.length === 0) {
    throw new Error(
      "[confedit] Replacing the YAML document root is not supported.",
    );
  }
  if (path.length === 1) {
    if (document.contents === null) {
      throw new Error(
        "[confedit] Cannot patch an empty YAML document without a root container.",
      );
    }
    return document.contents;
  }
  const parentPath = path.slice(0, -1);
  const parent = document.getIn(parentPath, true);
  if (parent === undefined || parent === null) {
    throw new Error(
      `[confedit] Missing parent path: ${formatPath(parentPath)}.`,
    );
  }
  if (!isMap(parent) && !isSeq(parent)) {
    throw new Error(
      `[confedit] Parent at ${formatPath(parentPath)} is not a YAML map or sequence.`,
    );
  }
  return parent;
}

function validateOperation(operation: JsonPatchOp): void {
  if (!Array.isArray(operation.path) || operation.path.length === 0) {
    throw new Error("[confedit] Patch path must be a non-empty array.");
  }
  if (
    operation.op !== "add" &&
    operation.op !== "replace" &&
    operation.op !== "remove"
  ) {
    throw new Error(
      `[confedit] Unsupported patch operation: ${String(operation.op)}.`,
    );
  }
}

function formatPath(path: readonly JsonPathSegment[]): string {
  return `[${path.map((segment) => JSON.stringify(segment)).join(", ")}]`;
}
