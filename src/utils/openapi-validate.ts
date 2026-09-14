import { open as openFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { OpenAPIV2, OpenAPIV3, OpenAPIV3_1 } from "openapi-types";
import { parse } from "yaml";
import { normalizeFilePath } from "./file-path";

/** A permissive structural type for OpenAPI 3.2 documents. */
export interface OpenAPIV3_2Document {
  openapi: string;
  info: Record<string, unknown>;
  paths?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Supported OpenAPI and Swagger document shapes. */
export type AnyOpenAPIDocument =
  | OpenAPIV2.Document
  | OpenAPIV3.Document
  | OpenAPIV3_1.Document
  | OpenAPIV3_2Document;

/** Selects how the supplied input string must be interpreted. */
export type OpenApiInputKind = "content" | "file";

/** Options for secure OpenAPI parsing and validation. */
export interface ValidateOpenApiOptions {
  /** Explicitly selects whether input is raw content or a local file path. */
  inputKind?: OpenApiInputKind;
  /** Base file path used for reference resolution context. */
  baseFilePath?: string;
  /** Root directory that contains every allowed local file. */
  allowedRootDirectory?: string;
  /** Total operation deadline in milliseconds. */
  timeoutMs?: number;
  /** Maximum raw input size in bytes. */
  maxInputBytes?: number;
  /** Maximum nodes permitted in parsed documents. */
  maxDocumentNodes?: number;
  /** Maximum nested object or array depth permitted in documents. */
  maxDocumentDepth?: number;
  /** Maximum validation errors included in an error message. */
  maxValidationErrors?: number;
  /** Maximum characters included for each validation error. */
  maxErrorMessageLength?: number;
  /** Optional cancellation signal. */
  signal?: AbortSignal;
}

/** A structured error safe to expose after mapping by an application boundary. */
export class OpenApiValidationError extends Error {
  public readonly code: string;
  public readonly cause?: unknown;

  public constructor(code: string, message: string, cause?: unknown) {
    super(message);
    this.name = "OpenApiValidationError";
    this.code = code;
    this.cause = cause;
  }
}

interface ResolvedOptions {
  inputKind: OpenApiInputKind;
  baseFilePath?: string;
  allowedRootDirectory?: string;
  timeoutMs: number;
  maxInputBytes: number;
  maxDocumentNodes: number;
  maxDocumentDepth: number;
  maxValidationErrors: number;
  maxErrorMessageLength: number;
  signal?: AbortSignal;
}

interface ValidationContext {
  readonly options: ResolvedOptions;
  readonly controller: AbortController;
  readonly deadline: number;
  rootDirectory?: string;
}

const DEFAULT_OPTIONS = {
  inputKind: "content" as const,
  timeoutMs: 15_000,
  maxInputBytes: 5 * 1024 * 1024,
  maxDocumentNodes: 100_000,
  maxDocumentDepth: 100,
  maxValidationErrors: 50,
  maxErrorMessageLength: 1_000,
};

/** Structured result returned by the Scalar OpenAPI validator. */
interface ScalarValidationResult {
  valid: boolean;
  errors?: Array<{ instancePath?: string; message?: string }>;
  specification?: unknown;
}

/** Function signature for the Scalar validate() export. */
type ScalarValidate = (
  spec: unknown,
  options?: { throwOnError?: boolean },
) => Promise<ScalarValidationResult>;

let scalarValidatePromise: Promise<ScalarValidate> | undefined;

/** Loads the Scalar validator without breaking CommonJS consumers. */
async function getScalarValidate(): Promise<ScalarValidate> {
  scalarValidatePromise ??= import("@powerduck/openapi-parser").then(
    (mod) => mod.validate as ScalarValidate,
  );
  return scalarValidatePromise;
}

/**
 * Validates a raw YAML or JSON OpenAPI document.
 *
 * Input is treated as content by default. File-path interpretation is only
 * enabled by explicitly setting inputKind to "file".
 *
 * Validation is delegated to @powerduck/openapi-parser. This module adds secure input handling: size
 * limits, path sandboxing, structural complexity guards, and deadlines.
 */
export async function validateOpenAPISpec(
  input: string,
  options: ValidateOpenApiOptions = {},
): Promise<AnyOpenAPIDocument> {
  assertNonEmptyString(input, "input");

  const resolved = resolveOptions(options);
  const linkedController = createLinkedAbortController(resolved.signal);
  const context: ValidationContext = {
    options: resolved,
    controller: linkedController.controller,
    deadline: Date.now() + resolved.timeoutMs,
  };

  try {
    return await runWithDeadline(context, async () => {
      if (resolved.inputKind === "file") {
        const filePath = await resolveInputFile(input, context);
        const content = await readSafeLocalFile(
          filePath,
          resolved.maxInputBytes,
          context,
          "INPUT_FILE_TOO_LARGE",
        );

        return validateRawContent(content, {
          ...context,
          options: {
            ...resolved,
            baseFilePath: filePath,
          },
        });
      }

      assertByteLength(input, resolved.maxInputBytes, "INPUT_TOO_LARGE");
      return validateRawContent(input, context);
    });
  } catch (error) {
    throw toPublicValidationError(error);
  } finally {
    linkedController.dispose();
    context.controller.abort();
  }
}

/**
 * Validates an OpenAPI document from an explicitly supplied local file path.
 */
export async function validateOpenAPIFile(
  filePath: string,
  options: ValidateOpenApiOptions = {},
): Promise<AnyOpenAPIDocument> {
  return validateOpenAPISpec(filePath, {
    ...options,
    inputKind: "file",
    baseFilePath: filePath,
  });
}

/** Parses content, enforces structural limits, and validates it via Scalar. */
async function validateRawContent(
  rawContent: string,
  context: ValidationContext,
): Promise<AnyOpenAPIDocument> {
  throwIfCancelled(context);

  assertByteLength(
    rawContent,
    context.options.maxInputBytes,
    "INPUT_TOO_LARGE",
  );

  const source = parseOpenApiSource(rawContent);
  assertDocumentComplexity(source, context.options);
  assertSupportedOpenApiVersion(source);

  const scalarValidate = await runWithDeadline(context, () =>
    getScalarValidate(),
  );

  const validationResult = await runWithDeadline(context, () =>
    scalarValidate(source as never, { throwOnError: false }),
  );

  if (!validationResult.valid) {
    throw new OpenApiValidationError(
      "SPEC_VALIDATION_FAILED",
      `OpenAPI validation failed: ${formatValidationErrors(
        validationResult.errors ?? [],
        context.options.maxValidationErrors,
        context.options.maxErrorMessageLength,
      )}`,
    );
  }

  return validationResult.specification as unknown as AnyOpenAPIDocument;
}

/** Resolves and validates all option values before any filesystem access. */
function resolveOptions(input: ValidateOpenApiOptions): ResolvedOptions {
  const options: ResolvedOptions = {
    inputKind: input.inputKind ?? DEFAULT_OPTIONS.inputKind,
    baseFilePath: input.baseFilePath,
    allowedRootDirectory: input.allowedRootDirectory,
    timeoutMs: input.timeoutMs ?? DEFAULT_OPTIONS.timeoutMs,
    maxInputBytes: input.maxInputBytes ?? DEFAULT_OPTIONS.maxInputBytes,
    maxDocumentNodes:
      input.maxDocumentNodes ?? DEFAULT_OPTIONS.maxDocumentNodes,
    maxDocumentDepth:
      input.maxDocumentDepth ?? DEFAULT_OPTIONS.maxDocumentDepth,
    maxValidationErrors:
      input.maxValidationErrors ?? DEFAULT_OPTIONS.maxValidationErrors,
    maxErrorMessageLength:
      input.maxErrorMessageLength ?? DEFAULT_OPTIONS.maxErrorMessageLength,
    signal: input.signal,
  };

  if (options.inputKind !== "content" && options.inputKind !== "file") {
    throw new OpenApiValidationError(
      "INVALID_OPTION",
      `inputKind must be "content" or "file", got: ${String(options.inputKind)}.`,
    );
  }

  assertPositiveFiniteNumber(options.timeoutMs, "timeoutMs");
  assertPositiveFiniteNumber(options.maxInputBytes, "maxInputBytes");
  assertPositiveFiniteNumber(options.maxDocumentNodes, "maxDocumentNodes");
  assertPositiveFiniteNumber(options.maxDocumentDepth, "maxDocumentDepth");
  assertPositiveFiniteNumber(
    options.maxValidationErrors,
    "maxValidationErrors",
  );
  assertPositiveFiniteNumber(
    options.maxErrorMessageLength,
    "maxErrorMessageLength",
  );

  return options;
}

function assertPositiveFiniteNumber(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new OpenApiValidationError(
      "INVALID_OPTION",
      `${label} must be a positive finite number, got: ${String(value)}.`,
    );
  }
}

/** Resolves a file-mode input and enforces the local-root policy. */
async function resolveInputFile(
  input: string,
  context: ValidationContext,
): Promise<string> {
  const normalized = normalizeFilePath(input);

  if (!context.options.allowedRootDirectory) {
    throw new OpenApiValidationError(
      "FILE_INPUT_FORBIDDEN",
      "File input requires allowedRootDirectory.",
    );
  }

  return assertPathInsideRoot(normalized, await getRootDirectory(context));
}

/** Reads a local file after enforcing size limits and cancellation. */
async function readSafeLocalFile(
  filePath: string,
  maxBytes: number,
  context: ValidationContext,
  overflowCode: string,
): Promise<string> {
  throwIfCancelled(context);

  const fileHandle = await openFile(filePath, "r");

  try {
    const stats = await fileHandle.stat();

    if (stats.size > maxBytes) {
      throw new OpenApiValidationError(
        overflowCode,
        `File exceeds maximum allowed size of ${maxBytes} bytes: ${filePath}.`,
      );
    }

    const buffer = Buffer.alloc(stats.size);
    await fileHandle.read(buffer, 0, stats.size, 0);
    return buffer.toString("utf8");
  } finally {
    await fileHandle.close();
  }
}

/** Parses YAML or JSON content into a plain object. */
function parseOpenApiSource(content: string): Record<string, unknown> {
  try {
    const doc = parse(content);

    if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
      throw new OpenApiValidationError(
        "INVALID_DOCUMENT_SHAPE",
        "OpenAPI document must be a JSON object.",
      );
    }

    return doc as unknown as Record<string, unknown>;
  } catch (error) {
    if (error instanceof OpenApiValidationError) {
      throw error;
    }

    throw new OpenApiValidationError(
      "PARSE_ERROR",
      `Failed to parse OpenAPI document: ${getErrorMessage(error)}.`,
      error,
    );
  }
}

/** Enforces maximum node count and nesting depth before validation. */
function assertDocumentComplexity(
  document: unknown,
  options: ResolvedOptions,
): void {
  let nodeCount = 0;
  const stack: Array<{ value: unknown; depth: number }> = [
    { value: document, depth: 0 },
  ];

  while (stack.length > 0) {
    const { value, depth } = stack.pop()!;

    if (depth > options.maxDocumentDepth) {
      throw new OpenApiValidationError(
        "DOCUMENT_TOO_DEEP",
        `Document exceeds maximum nesting depth of ${options.maxDocumentDepth}.`,
      );
    }

    nodeCount++;

    if (nodeCount > options.maxDocumentNodes) {
      throw new OpenApiValidationError(
        "DOCUMENT_TOO_LARGE",
        `Document exceeds maximum node count of ${options.maxDocumentNodes}.`,
      );
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        stack.push({ value: item, depth: depth + 1 });
      }
    } else if (value !== null && typeof value === "object") {
      for (const item of Object.values(value as Record<string, unknown>)) {
        stack.push({ value: item, depth: depth + 1 });
      }
    }
  }
}

/** Checks that the document declares a supported OpenAPI or Swagger version. */
function assertSupportedOpenApiVersion(
  document: Record<string, unknown>,
): void {
  const version = document.openapi ?? document.swagger;

  if (typeof version !== "string" || version.length === 0) {
    throw new OpenApiValidationError(
      "UNSUPPORTED_VERSION",
      "Document must declare an openapi or swagger version.",
    );
  }

  const major = Number.parseInt(version.split(".")[0] ?? "", 10);

  if (!Number.isFinite(major) || (major !== 2 && major !== 3)) {
    throw new OpenApiValidationError(
      "UNSUPPORTED_VERSION",
      `Unsupported OpenAPI/Swagger version: ${version}. Supported: 2.x, 3.x.`,
    );
  }
}

/** Formats validation errors into a concise human-readable string. */
function formatValidationErrors(
  errors: Array<{ instancePath?: string; message?: string }>,
  maxErrors: number,
  maxLength: number,
): string {
  const visible = errors.slice(0, maxErrors);
  const parts = visible.map((error) => {
    const path = error.instancePath ?? "";
    const message = error.message ?? "Unknown error";
    const text = path ? `${path}: ${message}` : message;
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
  });

  if (errors.length > maxErrors) {
    parts.push(`... and ${errors.length - maxErrors} more errors`);
  }

  return parts.join("; ");
}

/** Resolves and caches the allowed root directory as a real absolute path. */
async function getRootDirectory(context: ValidationContext): Promise<string> {
  if (context.rootDirectory) {
    return context.rootDirectory;
  }

  const configured = context.options.allowedRootDirectory;

  if (!configured) {
    throw new OpenApiValidationError(
      "INVALID_OPTION",
      "allowedRootDirectory is required for file operations.",
    );
  }

  const resolved = resolve(configured);
  const real = await realpath(resolved);
  const stats = await stat(real);

  if (!stats.isDirectory()) {
    throw new OpenApiValidationError(
      "INVALID_OPTION",
      `allowedRootDirectory is not a directory: ${configured}.`,
    );
  }

  context.rootDirectory = real;
  return real;
}

/** Asserts that a path is inside the allowed root directory. */
async function assertPathInsideRoot(
  filePath: string,
  rootDirectory: string,
): Promise<string> {
  const absolute = isAbsolute(filePath)
    ? filePath
    : resolve(rootDirectory, filePath);
  const real = await realpath(absolute);
  const relativePath = relative(rootDirectory, real);

  if (
    relativePath.startsWith("..") ||
    relativePath === "" ||
    (sep === "\\" && /^[a-zA-Z]:/.test(relativePath))
  ) {
    throw new OpenApiValidationError(
      "PATH_OUTSIDE_ROOT",
      `File path is outside the allowed root directory: ${filePath}.`,
    );
  }

  return real;
}

/** Runs an async operation with a deadline and cancellation support. */
async function runWithDeadline<T>(
  context: ValidationContext,
  operation: () => Promise<T>,
): Promise<T> {
  throwIfCancelled(context);

  const result = await Promise.race([
    operation(),
    createDeadlinePromise(context),
  ]);

  throwIfCancelled(context);
  return result as T;
}

/** Creates a promise that rejects when the deadline is reached. */
function createDeadlinePromise(context: ValidationContext): Promise<never> {
  return new Promise((_, reject) => {
    const remaining = context.deadline - Date.now();
    const delay = Math.max(0, Math.min(remaining, 2_147_483_647));

    const timer = setTimeout(() => {
      reject(
        new OpenApiValidationError(
          "OPERATION_TIMEOUT",
          `OpenAPI validation operation timed out after ${context.options.timeoutMs}ms.`,
        ),
      );
    }, delay);

    context.controller.signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(
          new OpenApiValidationError(
            "OPERATION_ABORTED",
            "OpenAPI validation operation was aborted.",
          ),
        );
      },
      { once: true },
    );
  });
}

/** Throws if the operation has been cancelled or the deadline has passed. */
function throwIfCancelled(context: ValidationContext): void {
  if (context.controller.signal.aborted) {
    throw new OpenApiValidationError(
      "OPERATION_ABORTED",
      "OpenAPI validation operation was aborted.",
    );
  }

  if (Date.now() > context.deadline) {
    throw new OpenApiValidationError(
      "OPERATION_TIMEOUT",
      `OpenAPI validation operation timed out after ${context.options.timeoutMs}ms.`,
    );
  }
}

/** Creates an AbortController linked to an optional external signal. */
function createLinkedAbortController(externalSignal?: AbortSignal): {
  controller: AbortController;
  dispose: () => void;
} {
  const controller = new AbortController();

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      const onAbort = () => controller.abort();
      externalSignal.addEventListener("abort", onAbort, { once: true });

      return {
        controller,
        dispose: () => externalSignal.removeEventListener("abort", onAbort),
      };
    }
  }

  return { controller, dispose: () => undefined };
}

/** Asserts that a string is non-empty. */
function assertNonEmptyString(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`[confedit] ${label} must be a non-empty string.`);
  }
}

/** Asserts that a string's byte length is within the limit. */
function assertByteLength(value: string, maxBytes: number, code: string): void {
  const byteLength = Buffer.byteLength(value, "utf8");

  if (byteLength > maxBytes) {
    throw new OpenApiValidationError(
      code,
      `Input exceeds maximum allowed size of ${maxBytes} bytes (actual: ${byteLength} bytes).`,
    );
  }
}

/** Extracts a human-readable error message from an unknown error. */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Maps internal errors to public OpenApiValidationError instances. */
function toPublicValidationError(error: unknown): OpenApiValidationError {
  if (error instanceof OpenApiValidationError) {
    return error;
  }

  return new OpenApiValidationError(
    "UNKNOWN_ERROR",
    `OpenAPI validation failed: ${getErrorMessage(error)}.`,
    error,
  );
}
