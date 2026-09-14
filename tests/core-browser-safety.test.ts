import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  patchContent,
  setContentValue,
  deleteContentValue,
} from "../src/core/patch";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Tests that verify the core layer is truly browser-safe:
 * - No imports of node:fs, node:path, node:url, or other Node.js-specific modules
 * - No references to process, Buffer, or other Node.js globals in the core source
 * - The core entry point only exports browser-safe functions
 */
describe("core layer — browser safety verification", () => {
  const coreSourceFiles = [
    "../src/core/patch.ts",
    "../src/core/validators.ts",
    "../src/core.ts",
    "../src/parsers/jsonc-patch.ts",
    "../src/parsers/yaml-patch.ts",
    "../src/types.ts",
  ];

  const forbiddenNodeImports = [
    "node:fs",
    "node:fs/promises",
    "node:path",
    "node:url",
    "node:os",
    "node:process",
    "node:child_process",
    "node:net",
    "node:http",
    "node:https",
    "node:crypto",
    "node:stream",
    "node:buffer",
  ];

  for (const filePath of coreSourceFiles) {
    it(`${filePath} does not import Node.js-specific modules`, () => {
      const absolutePath = join(__dirname, filePath);
      const content = readFileSync(absolutePath, "utf8");

      for (const forbiddenImport of forbiddenNodeImports) {
        expect(content).not.toContain(`from "${forbiddenImport}"`);
        expect(content).not.toContain(`from '${forbiddenImport}'`);
      }
    });
  }

  it("core entry point only exports browser-safe functions", () => {
    const coreEntry = readFileSync(join(__dirname, "../src/core.ts"), "utf8");

    // Should export core functions
    expect(coreEntry).toContain("patchContent");
    expect(coreEntry).toContain("setContentValue");
    expect(coreEntry).toContain("deleteContentValue");

    // Should NOT export file-layer functions
    expect(coreEntry).not.toContain("readConfigFile");
    expect(coreEntry).not.toContain("writeConfigFile");
    expect(coreEntry).not.toContain("patchConfigFile");
    expect(coreEntry).not.toContain("validateOpenAPISpec");
    expect(coreEntry).not.toContain("validateOpenAPIFile");
  });

  it("core patch module does not reference Node.js globals", () => {
    const patchSource = readFileSync(
      join(__dirname, "../src/core/patch.ts"),
      "utf8",
    );

    expect(patchSource).not.toMatch(/\bprocess\b/);
    expect(patchSource).not.toMatch(/\bBuffer\b/);
    expect(patchSource).not.toMatch(/\b__dirname\b/);
    expect(patchSource).not.toMatch(/\b__filename\b/);
  });

  it("core validators module does not reference Node.js globals", () => {
    const validatorsSource = readFileSync(
      join(__dirname, "../src/core/validators.ts"),
      "utf8",
    );

    expect(validatorsSource).not.toMatch(/\bprocess\b/);
    expect(validatorsSource).not.toMatch(/\bBuffer\b/);
    expect(validatorsSource).not.toMatch(/\b__dirname\b/);
    expect(validatorsSource).not.toMatch(/\b__filename\b/);
  });
});

describe("core layer — additional edge cases", () => {
  it("handles very deeply nested paths", () => {
    const deepPath = Array.from({ length: 20 }, (_, i) => `level${i}`);
    let content = "{}";

    // Build nested object step by step (add requires parent to exist)
    for (let i = 0; i < deepPath.length; i++) {
      content = patchContent(
        content,
        [{ op: "add", path: deepPath.slice(0, i + 1), value: i === deepPath.length - 1 ? "deep" : {} }],
        "json",
      );
    }

    const parsed = JSON.parse(content);
    let current = parsed;
    for (const key of deepPath) {
      current = current[key];
    }
    expect(current).toBe("deep");
  });

  it("handles very long strings as values", () => {
    const longString = "x".repeat(10000);
    const result = setContentValue("{}", ["long"], longString, "json");
    expect(JSON.parse(result).long).toBe(longString);
  });

  it("handles special characters in string values", () => {
    const special = 'line1\nline2\ttab"quotes"\\backslash';
    const result = setContentValue("{}", ["special"], special, "json");
    expect(JSON.parse(result).special).toBe(special);
  });

  it("handles Unicode in JSON keys and values", () => {
    const result = setContentValue("{}", ["cafe"], "naive", "json");
    expect(JSON.parse(result)["cafe"]).toBe("naive");
  });

  it("handles null values", () => {
    const result = setContentValue("{}", ["nothing"], null, "json");
    expect(JSON.parse(result).nothing).toBeNull();
  });

  it("handles empty JSON object", () => {
    const result = patchContent("{}", [{ op: "add", path: ["x"], value: 1 }], "json");
    expect(JSON.parse(result).x).toBe(1);
  });

  it("handles empty JSON array", () => {
    const result = patchContent("[]", [{ op: "add", path: [0], value: "first" }], "json");
    expect(JSON.parse(result)).toEqual(["first"]);
  });

  it("handles YAML with multi-line strings", () => {
    const yaml = `description: |
  This is a multi-line
  string with several lines.
`;
    const result = setContentValue(yaml, ["version"], "1.0.0", "yaml");
    expect(result).toContain("version: 1.0.0");
    expect(result).toContain("multi-line");
  });

  it("handles JSONC with trailing commas", () => {
    const jsonc = `{
  "name": "app",
  "version": "1.0.0",
}`;
    const result = setContentValue(jsonc, ["description"], "test", "jsonc");
    expect(result).toContain('"description": "test"');
  });

  it("patchContent returns the same reference for empty ops", () => {
    const original = '{"name": "app"}';
    const result = patchContent(original, [], "json");
    expect(result).toBe(original);
  });

  it("patchContent with non-strict mode skips failed operations", () => {
    const result = patchContent(
      '{"name": "app"}',
      [
        { op: "replace", path: ["missing"], value: 1 },
        { op: "add", path: ["version"], value: "1.0.0" },
      ],
      "json",
      { strict: false },
    );
    expect(JSON.parse(result).version).toBe("1.0.0");
  });

  it("setContentValue with number path segment inserts at array index", () => {
    const result = setContentValue('{"items": ["a", "b"]}', ["items", 0], "x", "json");
    // add at index 0 inserts, so result should be ["x", "a", "b"]
    expect(JSON.parse(result).items).toEqual(["x", "a", "b"]);
  });

  it("deleteContentValue with number path segment removes array element", () => {
    const result = deleteContentValue('{"items": ["a", "b", "c"]}', ["items", 1], "json");
    expect(JSON.parse(result).items).toEqual(["a", "c"]);
  });

  it("handles concurrent patch operations on the same string (pure function, no shared state)", () => {
    const original = '{"count": 0}';

    const results = Array.from({ length: 10 }, (_, i) =>
      patchContent(original, [{ op: "add", path: [`field${i}`], value: i }], "json"),
    );

    for (let i = 0; i < 10; i++) {
      const parsed = JSON.parse(results[i]);
      expect(parsed[`field${i}`]).toBe(i);
      expect(parsed.count).toBe(0);
    }
  });

  it("handles boolean values", () => {
    const result = setContentValue("{}", ["enabled"], true, "json");
    expect(JSON.parse(result).enabled).toBe(true);
  });

  it("handles number values", () => {
    const result = setContentValue("{}", ["port"], 8080, "json");
    expect(JSON.parse(result).port).toBe(8080);
  });

  it("handles object values", () => {
    const result = setContentValue("{}", ["meta"], { author: "test", year: 2024 }, "json");
    expect(JSON.parse(result).meta.author).toBe("test");
    expect(JSON.parse(result).meta.year).toBe(2024);
  });

  it("handles array values", () => {
    const result = setContentValue("{}", ["tags"], ["a", "b", "c"], "json");
    expect(JSON.parse(result).tags).toEqual(["a", "b", "c"]);
  });

  it("replace operation updates existing value", () => {
    const result = patchContent(
      '{"version": "1.0.0"}',
      [{ op: "replace", path: ["version"], value: "2.0.0" }],
      "json",
    );
    expect(JSON.parse(result).version).toBe("2.0.0");
  });

  it("remove operation deletes existing key", () => {
    const result = patchContent(
      '{"name": "app", "legacy": true}',
      [{ op: "remove", path: ["legacy"] }],
      "json",
    );
    expect(JSON.parse(result).legacy).toBeUndefined();
    expect(JSON.parse(result).name).toBe("app");
  });
});
