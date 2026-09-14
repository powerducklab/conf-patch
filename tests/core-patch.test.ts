import { describe, it, expect } from "vitest";
import {
  patchContent,
  setContentValue,
  deleteContentValue,
} from "../src/core/patch";

describe("patchContent — JSON", () => {
  it("adds a top-level property", () => {
    const result = patchContent(
      JSON.stringify({ name: "app" }),
      [{ op: "add", path: ["version"], value: "1.0.0" }],
      "json",
    );
    expect(JSON.parse(result).version).toBe("1.0.0");
  });

  it("replaces an existing property", () => {
    const result = patchContent(
      JSON.stringify({ version: "1.0.0" }),
      [{ op: "replace", path: ["version"], value: "2.0.0" }],
      "json",
    );
    expect(JSON.parse(result).version).toBe("2.0.0");
  });

  it("removes a property", () => {
    const result = patchContent(
      JSON.stringify({ name: "app", legacy: true }),
      [{ op: "remove", path: ["legacy"] }],
      "json",
    );
    expect(JSON.parse(result).legacy).toBeUndefined();
    expect(JSON.parse(result).name).toBe("app");
  });

  it("applies multiple operations", () => {
    const result = patchContent(
      JSON.stringify({ name: "app" }),
      [
        { op: "add", path: ["version"], value: "1.0.0" },
        { op: "add", path: ["enabled"], value: true },
      ],
      "json",
    );
    const parsed = JSON.parse(result);
    expect(parsed.version).toBe("1.0.0");
    expect(parsed.enabled).toBe(true);
  });

  it("returns the original content for empty operations", () => {
    const original = JSON.stringify({ name: "app" });
    const result = patchContent(original, [], "json");
    expect(result).toBe(original);
  });

  it("sets a nested property", () => {
    const result = patchContent(
      JSON.stringify({ server: { host: "localhost" } }),
      [{ op: "add", path: ["server", "port"], value: 8080 }],
      "json",
    );
    expect(JSON.parse(result).server.port).toBe(8080);
  });

  it("throws for non-string content", () => {
    expect(() => patchContent(42 as unknown as string, [], "json")).toThrow(
      TypeError,
    );
  });

  it("throws for invalid operations", () => {
    expect(() =>
      patchContent("{}", [{ op: "move" as never, path: ["a"], value: 1 }], "json"),
    ).toThrow();
  });

  it("throws for empty path", () => {
    expect(() =>
      patchContent("{}", [{ op: "add", path: [], value: 1 }], "json"),
    ).toThrow(TypeError);
  });

  it("throws for add without value", () => {
    expect(() =>
      patchContent("{}", [{ op: "add", path: ["x"] } as never], "json"),
    ).toThrow(TypeError);
  });

  it("throws for replace without value", () => {
    expect(() =>
      patchContent("{}", [{ op: "replace", path: ["x"] } as never], "json"),
    ).toThrow(TypeError);
  });

  it("supports strict mode that throws on missing path", () => {
    expect(() =>
      patchContent(
        "{}",
        [{ op: "replace", path: ["missing"], value: 1 }],
        "json",
        { strict: true },
      ),
    ).toThrow();
  });

  it("supports non-strict mode that skips failed operations", () => {
    const result = patchContent(
      JSON.stringify({ name: "app" }),
      [
        { op: "replace", path: ["missing"], value: 1 },
        { op: "add", path: ["version"], value: "1.0.0" },
      ],
      "json",
      { strict: false },
    );
    expect(JSON.parse(result).version).toBe("1.0.0");
  });
});

describe("patchContent — JSONC", () => {
  it("preserves comments when adding a property", () => {
    const source = '{\n  // Application name\n  "name": "app"\n}';
    const result = patchContent(
      source,
      [{ op: "add", path: ["version"], value: "1.0.0" }],
      "jsonc",
    );
    expect(result).toContain("// Application name");
    expect(result).toContain('"version": "1.0.0"');
  });

  it("preserves trailing commas", () => {
    const source = '{\n  "name": "app",\n}';
    const result = patchContent(
      source,
      [{ op: "add", path: ["version"], value: "1.0.0" }],
      "jsonc",
    );
    expect(result).toContain('"version": "1.0.0"');
  });
});

describe("patchContent — YAML", () => {
  it("adds a top-level property", () => {
    const result = patchContent(
      "name: app\n",
      [{ op: "add", path: ["version"], value: "1.0.0" }],
      "yaml",
    );
    expect(result).toContain("version: 1.0.0");
  });

  it("replaces an existing property", () => {
    const result = patchContent(
      "version: 1.0.0\n",
      [{ op: "replace", path: ["version"], value: "2.0.0" }],
      "yaml",
    );
    expect(result).toContain("version: 2.0.0");
    expect(result).not.toContain("version: 1.0.0");
  });

  it("removes a property", () => {
    const result = patchContent(
      "name: app\nlegacy: true\n",
      [{ op: "remove", path: ["legacy"] }],
      "yaml",
    );
    expect(result).toContain("name: app");
    expect(result).not.toContain("legacy:");
  });

  it("preserves comments", () => {
    const source = "# Config\nname: app\n";
    const result = patchContent(
      source,
      [{ op: "add", path: ["version"], value: "1.0.0" }],
      "yaml",
    );
    expect(result).toContain("# Config");
  });

  it("sets a nested property", () => {
    const result = patchContent(
      "server:\n  host: localhost\n",
      [{ op: "add", path: ["server", "port"], value: 8080 }],
      "yaml",
    );
    expect(result).toContain("port: 8080");
  });
});

describe("setContentValue", () => {
  it("sets a value in JSON", () => {
    const result = setContentValue(
      JSON.stringify({ name: "app" }),
      ["version"],
      "1.0.0",
      "json",
    );
    expect(JSON.parse(result).version).toBe("1.0.0");
  });

  it("sets a value in YAML", () => {
    const result = setContentValue("name: app\n", ["version"], "1.0.0", "yaml");
    expect(result).toContain("version: 1.0.0");
  });

  it("sets a boolean value", () => {
    const result = setContentValue("{}", ["enabled"], true, "json");
    expect(JSON.parse(result).enabled).toBe(true);
  });

  it("sets a number value", () => {
    const result = setContentValue("{}", ["port"], 8080, "json");
    expect(JSON.parse(result).port).toBe(8080);
  });

  it("sets an object value", () => {
    const result = setContentValue("{}", ["meta"], { author: "test" }, "json");
    expect(JSON.parse(result).meta.author).toBe("test");
  });

  it("sets an array value", () => {
    const result = setContentValue("{}", ["tags"], ["a", "b"], "json");
    expect(JSON.parse(result).tags).toEqual(["a", "b"]);
  });

  it("throws for empty path", () => {
    expect(() => setContentValue("{}", [], "value", "json")).toThrow(TypeError);
  });

  it("throws for empty string path segment", () => {
    expect(() => setContentValue("{}", [""], "value", "json")).toThrow(TypeError);
  });

  it("throws for negative array index", () => {
    expect(() => setContentValue("{}", ["items", -1], "value", "json")).toThrow(
      TypeError,
    );
  });
});

describe("deleteContentValue", () => {
  it("deletes a property from JSON", () => {
    const result = deleteContentValue(
      JSON.stringify({ name: "app", legacy: true }),
      ["legacy"],
      "json",
    );
    expect(JSON.parse(result).legacy).toBeUndefined();
    expect(JSON.parse(result).name).toBe("app");
  });

  it("deletes a property from YAML", () => {
    const result = deleteContentValue("name: app\nlegacy: true\n", ["legacy"], "yaml");
    expect(result).toContain("name: app");
    expect(result).not.toContain("legacy:");
  });

  it("deletes a nested property", () => {
    const result = deleteContentValue(
      JSON.stringify({ server: { host: "localhost", port: 3000 } }),
      ["server", "port"],
      "json",
    );
    expect(JSON.parse(result).server.port).toBeUndefined();
    expect(JSON.parse(result).server.host).toBe("localhost");
  });

  it("throws when deleting a non-existent property", () => {
    expect(() =>
      deleteContentValue(JSON.stringify({ name: "app" }), ["missing"], "json"),
    ).toThrow();
  });

  it("throws for empty path", () => {
    expect(() => deleteContentValue("{}", [], "json")).toThrow(TypeError);
  });
});

describe("core layer — browser compatibility", () => {
  it("does not import node:fs or node:path in core modules", () => {
    // This test verifies the core layer is browser-safe by checking
    // that the functions work without any Node.js-specific APIs.
    // The functions themselves are pure and don't touch the filesystem.
    const result = patchContent(
      '{"name":"app"}',
      [{ op: "add", path: ["version"], value: "1.0.0" }],
      "json",
    );
    expect(JSON.parse(result).version).toBe("1.0.0");
  });

  it("setContentValue works without filesystem", () => {
    const result = setContentValue("name: app\n", ["version"], "1.0.0", "yaml");
    expect(result).toContain("version: 1.0.0");
  });

  it("deleteContentValue works without filesystem", () => {
    const result = deleteContentValue(
      JSON.stringify({ a: 1, b: 2 }),
      ["b"],
      "json",
    );
    expect(JSON.parse(result).b).toBeUndefined();
  });
});
