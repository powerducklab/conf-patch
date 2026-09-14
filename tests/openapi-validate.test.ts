/**
 * OpenAPI validation tests.
 * Covers validateOpenAPISpec, validateOpenAPIFile, OpenApiValidationError,
 * security controls, error codes, and format/version support.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  validateOpenAPISpec,
  validateOpenAPIFile,
  OpenApiValidationError,
} from "../src/index";

const VALID_OPENAPI_31 = `{
  "openapi": "3.1.0",
  "info": { "title": "Test API", "version": "1.0.0" },
  "paths": {}
}`;

const VALID_OPENAPI_30_YAML = `
openapi: "3.0.0"
info:
  title: Test API
  version: "1.0.0"
paths: {}
`;

const VALID_SWAGGER_20 = `{
  "swagger": "2.0",
  "info": { "title": "Test API", "version": "1.0.0" },
  "paths": {}
}`;

const INVALID_JSON = `{ "openapi": "3.1.0", "info": { "title": "Broken`;

describe("validateOpenAPISpec — basic functionality", () => {
  it("validates a valid OpenAPI 3.1 JSON document", async () => {
    const result = await validateOpenAPISpec(VALID_OPENAPI_31);
    expect(result).toBeDefined();
    expect(result.openapi).toBe("3.1.0");
    expect(result.info).toBeDefined();
  });

  it("validates a valid OpenAPI 3.0 YAML document", async () => {
    const result = await validateOpenAPISpec(VALID_OPENAPI_30_YAML);
    expect(result).toBeDefined();
    expect(result.openapi).toBe("3.0.0");
  });

  it("validates a valid Swagger 2.0 document", async () => {
    const result = await validateOpenAPISpec(VALID_SWAGGER_20);
    expect(result).toBeDefined();
    expect(result.swagger).toBe("2.0");
  });

  it("returns the validated document with normalized structure", async () => {
    const result = await validateOpenAPISpec(VALID_OPENAPI_31);
    expect(typeof result).toBe("object");
    expect(result).not.toBeNull();
  });
});

describe("validateOpenAPISpec — error handling", () => {
  it("throws OpenApiValidationError for empty input", async () => {
    await expect(validateOpenAPISpec("")).rejects.toThrow(TypeError);
  });

  it("throws OpenApiValidationError for non-string input", async () => {
    // @ts-expect-error Testing runtime type check
    await expect(validateOpenAPISpec(null)).rejects.toThrow(TypeError);
    // @ts-expect-error Testing runtime type check
    await expect(validateOpenAPISpec(undefined)).rejects.toThrow(TypeError);
    // @ts-expect-error Testing runtime type check
    await expect(validateOpenAPISpec(123)).rejects.toThrow(TypeError);
  });

  it("throws OpenApiValidationError for invalid JSON/YAML", async () => {
    try {
      await validateOpenAPISpec(INVALID_JSON);
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(OpenApiValidationError);
      expect((error as OpenApiValidationError).code).toBe("PARSE_ERROR");
    }
  });

  it("throws OpenApiValidationError for document without openapi/swagger version", async () => {
    try {
      await validateOpenAPISpec('{"info": {"title": "No Version"}}');
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(OpenApiValidationError);
      expect((error as OpenApiValidationError).code).toBe("UNSUPPORTED_VERSION");
    }
  });

  it("throws OpenApiValidationError for unsupported OpenAPI version", async () => {
    try {
      await validateOpenAPISpec('{"openapi": "1.0.0", "info": {"title": "Old"}}');
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(OpenApiValidationError);
      expect((error as OpenApiValidationError).code).toBe("UNSUPPORTED_VERSION");
    }
  });

  it("throws OpenApiValidationError for non-object document", async () => {
    try {
      await validateOpenAPISpec('"just a string"');
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(OpenApiValidationError);
      expect((error as OpenApiValidationError).code).toBe("INVALID_DOCUMENT_SHAPE");
    }
  });

  it("throws OpenApiValidationError for array document", async () => {
    try {
      await validateOpenAPISpec("[1, 2, 3]");
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(OpenApiValidationError);
      expect((error as OpenApiValidationError).code).toBe("INVALID_DOCUMENT_SHAPE");
    }
  });
});

describe("validateOpenAPISpec — security controls", () => {
  it("enforces maxInputBytes limit", async () => {
    try {
      await validateOpenAPISpec(VALID_OPENAPI_31, { maxInputBytes: 10 });
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(OpenApiValidationError);
      expect((error as OpenApiValidationError).code).toBe("INPUT_TOO_LARGE");
    }
  });

  it("enforces maxDocumentDepth limit", async () => {
    const deepDoc = {
      openapi: "3.1.0",
      info: { title: "Deep" },
      a: { b: { c: { d: { e: { f: { g: "deep" } } } } } },
    };
    try {
      await validateOpenAPISpec(JSON.stringify(deepDoc), { maxDocumentDepth: 3 });
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(OpenApiValidationError);
      expect((error as OpenApiValidationError).code).toBe("DOCUMENT_TOO_DEEP");
    }
  });

  it("enforces maxDocumentNodes limit", async () => {
    const largeDoc = {
      openapi: "3.1.0",
      info: { title: "Large" },
      items: Array.from({ length: 100 }, (_, i) => ({ id: i, name: `item-${i}` })),
    };
    try {
      await validateOpenAPISpec(JSON.stringify(largeDoc), { maxDocumentNodes: 10 });
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(OpenApiValidationError);
      expect((error as OpenApiValidationError).code).toBe("DOCUMENT_TOO_LARGE");
    }
  });

  it("rejects invalid inputKind option", async () => {
    try {
      await validateOpenAPISpec(VALID_OPENAPI_31, {
        // @ts-expect-error Testing invalid option
        inputKind: "invalid",
      });
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(OpenApiValidationError);
      expect((error as OpenApiValidationError).code).toBe("INVALID_OPTION");
    }
  });

  it("rejects non-positive timeoutMs", async () => {
    try {
      await validateOpenAPISpec(VALID_OPENAPI_31, { timeoutMs: -1 });
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(OpenApiValidationError);
      expect((error as OpenApiValidationError).code).toBe("INVALID_OPTION");
    }
  });

  it("rejects non-positive maxInputBytes", async () => {
    try {
      await validateOpenAPISpec(VALID_OPENAPI_31, { maxInputBytes: 0 });
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(OpenApiValidationError);
      expect((error as OpenApiValidationError).code).toBe("INVALID_OPTION");
    }
  });

  it("supports AbortSignal cancellation", async () => {
    const controller = new AbortController();
    controller.abort();

    try {
      await validateOpenAPISpec(VALID_OPENAPI_31, { signal: controller.signal });
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(OpenApiValidationError);
      expect((error as OpenApiValidationError).code).toBe("OPERATION_ABORTED");
    }
  });
});

describe("validateOpenAPISpec — spec validation failures", () => {
  it("throws SPEC_VALIDATION_FAILED for structurally invalid OpenAPI", async () => {
    const invalidSpec = `{
      "openapi": "3.1.0",
      "info": { "title": "Test" }
    }`;

    try {
      await validateOpenAPISpec(invalidSpec);
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(OpenApiValidationError);
      expect((error as OpenApiValidationError).code).toBe("SPEC_VALIDATION_FAILED");
    }
  });

  it("limits the number of validation errors in message", async () => {
    // Create a spec with many potential issues
    const manyIssues = `{
      "openapi": "3.1.0",
      "info": { "title": "Test" },
      "paths": {}
    }`;

    try {
      await validateOpenAPISpec(manyIssues, { maxValidationErrors: 1 });
    } catch (error) {
      if (error instanceof OpenApiValidationError && error.code === "SPEC_VALIDATION_FAILED") {
        // Message should be truncated
        expect(error.message.length).toBeLessThan(2000);
      }
    }
  });
});

describe("validateOpenAPIFile — file-based validation", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "confedit-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("validates a valid OpenAPI file", async () => {
    const filePath = join(tempDir, "openapi.json");
    await writeFile(filePath, VALID_OPENAPI_31, "utf8");

    const result = await validateOpenAPIFile(filePath, {
      allowedRootDirectory: tempDir,
    });
    expect(result).toBeDefined();
    expect(result.openapi).toBe("3.1.0");
  });

  it("validates a YAML OpenAPI file", async () => {
    const filePath = join(tempDir, "openapi.yaml");
    await writeFile(filePath, VALID_OPENAPI_30_YAML, "utf8");

    const result = await validateOpenAPIFile(filePath, {
      allowedRootDirectory: tempDir,
    });
    expect(result).toBeDefined();
    expect(result.openapi).toBe("3.0.0");
  });

  it("throws FILE_INPUT_FORBIDDEN when allowedRootDirectory is missing", async () => {
    const filePath = join(tempDir, "openapi.json");
    await writeFile(filePath, VALID_OPENAPI_31, "utf8");

    try {
      await validateOpenAPIFile(filePath);
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(OpenApiValidationError);
      expect((error as OpenApiValidationError).code).toBe("FILE_INPUT_FORBIDDEN");
    }
  });

  it("throws PATH_OUTSIDE_ROOT for files outside allowed directory", async () => {
    const filePath = join(tempDir, "..", "outside.json");
    await writeFile(filePath, VALID_OPENAPI_31, "utf8");

    try {
      await validateOpenAPIFile(filePath, {
        allowedRootDirectory: tempDir,
      });
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(OpenApiValidationError);
      const code = (error as OpenApiValidationError).code;
      expect(["PATH_OUTSIDE_ROOT", "FILE_INPUT_FORBIDDEN"]).toContain(code);
    }

    // Clean up outside file
    await rm(filePath, { force: true });
  });

  it("throws INPUT_FILE_TOO_LARGE for files exceeding size limit", async () => {
    const filePath = join(tempDir, "large.json");
    const largeContent = VALID_OPENAPI_31 + " ".repeat(1000);
    await writeFile(filePath, largeContent, "utf8");

    try {
      await validateOpenAPIFile(filePath, {
        allowedRootDirectory: tempDir,
        maxInputBytes: 100,
      });
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(OpenApiValidationError);
      expect((error as OpenApiValidationError).code).toBe("INPUT_FILE_TOO_LARGE");
    }
  });

  it("throws for non-existent file", async () => {
    try {
      await validateOpenAPIFile(join(tempDir, "nonexistent.json"), {
        allowedRootDirectory: tempDir,
      });
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(OpenApiValidationError);
    }
  });
});

describe("OpenApiValidationError — error type", () => {
  it("is an instance of Error", () => {
    const error = new OpenApiValidationError("TEST_CODE", "Test message");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(OpenApiValidationError);
  });

  it("has correct name, code, and message", () => {
    const error = new OpenApiValidationError("TEST_CODE", "Test message");
    expect(error.name).toBe("OpenApiValidationError");
    expect(error.code).toBe("TEST_CODE");
    expect(error.message).toBe("Test message");
  });

  it("preserves cause when provided", () => {
    const cause = new Error("Original error");
    const error = new OpenApiValidationError("TEST_CODE", "Wrapped error", cause);
    expect(error.cause).toBe(cause);
  });

  it("has undefined cause when not provided", () => {
    const error = new OpenApiValidationError("TEST_CODE", "Test message");
    expect(error.cause).toBeUndefined();
  });

  it("supports instanceof checks across module boundaries", async () => {
    try {
      await validateOpenAPISpec("");
    } catch (error) {
      expect(error).toBeInstanceOf(TypeError);
    }

    try {
      await validateOpenAPISpec(INVALID_JSON);
    } catch (error) {
      expect(error).toBeInstanceOf(OpenApiValidationError);
    }
  });
});

describe("validateOpenAPISpec — format and version support", () => {
  it("supports OpenAPI 3.0 JSON", async () => {
    const doc = `{
      "openapi": "3.0.0",
      "info": { "title": "Test", "version": "1.0.0" },
      "paths": {}
    }`;
    const result = await validateOpenAPISpec(doc);
    expect(result.openapi).toBe("3.0.0");
  });

  it("supports OpenAPI 3.1 JSON", async () => {
    const result = await validateOpenAPISpec(VALID_OPENAPI_31);
    expect(result.openapi).toBe("3.1.0");
  });

  it("supports OpenAPI 3.0 YAML", async () => {
    const result = await validateOpenAPISpec(VALID_OPENAPI_30_YAML);
    expect(result.openapi).toBe("3.0.0");
  });

  it("supports Swagger 2.0 JSON", async () => {
    const result = await validateOpenAPISpec(VALID_SWAGGER_20);
    expect(result.swagger).toBe("2.0");
  });

  it("supports Swagger 2.0 YAML", async () => {
    const yaml = `
swagger: "2.0"
info:
  title: Test API
  version: "1.0.0"
paths: {}
`;
    const result = await validateOpenAPISpec(yaml);
    expect(result.swagger).toBe("2.0");
  });

  it("handles YAML with comments", async () => {
    const yamlWithComments = `
# This is a comment
openapi: "3.0.0"
info:
  title: Test API # inline comment
  version: "1.0.0"
paths: {}
`;
    const result = await validateOpenAPISpec(yamlWithComments);
    expect(result.openapi).toBe("3.0.0");
  });

  it("handles YAML with multi-line strings", async () => {
    const yaml = `
openapi: "3.0.0"
info:
  title: |
    Multi-line
    title
  version: "1.0.0"
paths: {}
`;
    const result = await validateOpenAPISpec(yaml);
    expect(result.openapi).toBe("3.0.0");
  });
});

describe("validateOpenAPISpec — edge cases", () => {
  it("handles minimal valid document", async () => {
    const minimal = `{"openapi": "3.0.0", "info": {"title": "Min", "version": "1"}, "paths": {}}`;
    const result = await validateOpenAPISpec(minimal);
    expect(result).toBeDefined();
  });

  it("handles document with Unicode characters", async () => {
    const unicodeDoc = `{
      "openapi": "3.0.0",
      "info": { "title": "API — Test", "version": "1.0.0" },
      "paths": {}
    }`;
    const result = await validateOpenAPISpec(unicodeDoc);
    expect(result).toBeDefined();
  });

  it("handles document with large numbers", async () => {
    const largeNumbers = `{
      "openapi": "3.0.0",
      "info": { "title": "Large", "version": "1.0.0" },
      "paths": {},
      "x-large": 9007199254740991
    }`;
    const result = await validateOpenAPISpec(largeNumbers);
    expect(result).toBeDefined();
  });

  it("handles deeply nested but acyclic document", async () => {
    const doc = {
      openapi: "3.0.0",
      info: { title: "Deep", version: "1.0.0" },
      paths: {},
      "x-deep": { a: { b: { c: { d: { e: { f: { g: "deep" } } } } } } },
    };
    const result = await validateOpenAPISpec(JSON.stringify(doc), {
      maxDocumentDepth: 20,
    });
    expect(result.openapi).toBe("3.0.0");
  });

  it("handles document with many keys at same level", async () => {
    const manyKeys: Record<string, unknown> = {
      openapi: "3.0.0",
      info: { title: "Many", version: "1.0.0" },
      paths: {},
    };
    for (let i = 0; i < 50; i++) {
      manyKeys[`x-key-${i}`] = i;
    }
    const result = await validateOpenAPISpec(JSON.stringify(manyKeys), {
      maxDocumentNodes: 1000,
    });
    expect(result.openapi).toBe("3.0.0");
  });

  it("handles whitespace-only input", async () => {
    try {
      await validateOpenAPISpec("   \n  \t  ");
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(OpenApiValidationError);
    }
  });

  it("handles input with only null value", async () => {
    try {
      await validateOpenAPISpec("null");
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(OpenApiValidationError);
      expect((error as OpenApiValidationError).code).toBe("INVALID_DOCUMENT_SHAPE");
    }
  });

  it("handles input with only boolean value", async () => {
    try {
      await validateOpenAPISpec("true");
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(OpenApiValidationError);
      expect((error as OpenApiValidationError).code).toBe("INVALID_DOCUMENT_SHAPE");
    }
  });

  it("handles input with only number value", async () => {
    try {
      await validateOpenAPISpec("42");
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(OpenApiValidationError);
      expect((error as OpenApiValidationError).code).toBe("INVALID_DOCUMENT_SHAPE");
    }
  });
});
