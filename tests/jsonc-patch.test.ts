import { describe, it, expect } from "vitest";
import { patchJsonSource } from "../src/parsers/jsonc-patch.js";

describe("patchJsonSource — add operation", () => {
  it("adds a top-level property to a JSON object", () => {
    const source = JSON.stringify({ name: "app" }, null, 2);
    const result = patchJsonSource(source, [{ op: "add", path: ["version"], value: "1.0.0" }]);
    const parsed = JSON.parse(result);
    expect(parsed.name).toBe("app");
    expect(parsed.version).toBe("1.0.0");
  });

  it("adds a nested property", () => {
    const source = JSON.stringify({ server: { host: "localhost" } }, null, 2);
    const result = patchJsonSource(source, [
      { op: "add", path: ["server", "port"], value: 8080 },
    ]);
    const parsed = JSON.parse(result);
    expect(parsed.server.host).toBe("localhost");
    expect(parsed.server.port).toBe(8080);
  });

  it("adds an item to an array at a specific index", () => {
    const source = JSON.stringify({ items: ["a", "c"] }, null, 2);
    const result = patchJsonSource(source, [
      { op: "add", path: ["items", 1], value: "b" },
    ]);
    const parsed = JSON.parse(result);
    expect(parsed.items).toEqual(["a", "b", "c"]);
  });

  it("appends an item to the end of an array", () => {
    const source = JSON.stringify({ items: ["a"] }, null, 2);
    const result = patchJsonSource(source, [
      { op: "add", path: ["items", 1], value: "b" },
    ]);
    const parsed = JSON.parse(result);
    expect(parsed.items).toEqual(["a", "b"]);
  });

  it("replaces an existing property with add", () => {
    const source = JSON.stringify({ version: "1.0.0" }, null, 2);
    const result = patchJsonSource(source, [
      { op: "add", path: ["version"], value: "2.0.0" },
    ]);
    expect(JSON.parse(result).version).toBe("2.0.0");
  });

  it("adds a boolean value", () => {
    const source = JSON.stringify({ enabled: false }, null, 2);
    const result = patchJsonSource(source, [
      { op: "add", path: ["debug"], value: true },
    ]);
    expect(JSON.parse(result).debug).toBe(true);
  });

  it("adds a null value", () => {
    const source = JSON.stringify({ name: "app" }, null, 2);
    const result = patchJsonSource(source, [
      { op: "add", path: ["deprecated"], value: null },
    ]);
    expect(JSON.parse(result).deprecated).toBeNull();
  });

  it("adds an object value", () => {
    const source = JSON.stringify({ name: "app" }, null, 2);
    const result = patchJsonSource(source, [
      { op: "add", path: ["meta"], value: { author: "test", year: 2024 } },
    ]);
    const parsed = JSON.parse(result);
    expect(parsed.meta.author).toBe("test");
    expect(parsed.meta.year).toBe(2024);
  });

  it("throws when adding at an out-of-bounds array index", () => {
    const source = JSON.stringify({ items: ["a"] }, null, 2);
    expect(() =>
      patchJsonSource(source, [{ op: "add", path: ["items", 5], value: "x" }]),
    ).toThrow();
  });

  it("throws when adding to a non-container parent", () => {
    const source = JSON.stringify({ name: "app" }, null, 2);
    expect(() =>
      patchJsonSource(source, [{ op: "add", path: ["name", "extra"], value: "x" }]),
    ).toThrow();
  });

  it("throws when the parent path does not exist", () => {
    const source = JSON.stringify({ name: "app" }, null, 2);
    expect(() =>
      patchJsonSource(source, [{ op: "add", path: ["missing", "key"], value: "x" }]),
    ).toThrow();
  });
});

describe("patchJsonSource — replace operation", () => {
  it("replaces an existing property", () => {
    const source = JSON.stringify({ version: "1.0.0" }, null, 2);
    const result = patchJsonSource(source, [
      { op: "replace", path: ["version"], value: "2.0.0" },
    ]);
    expect(JSON.parse(result).version).toBe("2.0.0");
  });

  it("replaces a nested property", () => {
    const source = JSON.stringify({ server: { port: 3000 } }, null, 2);
    const result = patchJsonSource(source, [
      { op: "replace", path: ["server", "port"], value: 8080 },
    ]);
    expect(JSON.parse(result).server.port).toBe(8080);
  });

  it("replaces an array item", () => {
    const source = JSON.stringify({ items: ["a", "b", "c"] }, null, 2);
    const result = patchJsonSource(source, [
      { op: "replace", path: ["items", 1], value: "x" },
    ]);
    expect(JSON.parse(result).items).toEqual(["a", "x", "c"]);
  });

  it("throws when replacing a non-existent property", () => {
    const source = JSON.stringify({ name: "app" }, null, 2);
    expect(() =>
      patchJsonSource(source, [{ op: "replace", path: ["missing"], value: "x" }]),
    ).toThrow();
  });

  it("throws when replacing an out-of-bounds array index", () => {
    const source = JSON.stringify({ items: ["a"] }, null, 2);
    expect(() =>
      patchJsonSource(source, [{ op: "replace", path: ["items", 5], value: "x" }]),
    ).toThrow();
  });
});

describe("patchJsonSource — remove operation", () => {
  it("removes an existing property", () => {
    const source = JSON.stringify({ name: "app", version: "1.0.0" }, null, 2);
    const result = patchJsonSource(source, [{ op: "remove", path: ["version"] }]);
    const parsed = JSON.parse(result);
    expect(parsed.name).toBe("app");
    expect(parsed.version).toBeUndefined();
  });

  it("removes a nested property", () => {
    const source = JSON.stringify({ server: { host: "localhost", port: 3000 } }, null, 2);
    const result = patchJsonSource(source, [{ op: "remove", path: ["server", "port"] }]);
    const parsed = JSON.parse(result);
    expect(parsed.server.host).toBe("localhost");
    expect(parsed.server.port).toBeUndefined();
  });

  it("removes an array item", () => {
    const source = JSON.stringify({ items: ["a", "b", "c"] }, null, 2);
    const result = patchJsonSource(source, [{ op: "remove", path: ["items", 1] }]);
    expect(JSON.parse(result).items).toEqual(["a", "c"]);
  });

  it("throws when removing a non-existent property", () => {
    const source = JSON.stringify({ name: "app" }, null, 2);
    expect(() => patchJsonSource(source, [{ op: "remove", path: ["missing"] }])).toThrow();
  });

  it("throws when removing an out-of-bounds array index", () => {
    const source = JSON.stringify({ items: ["a"] }, null, 2);
    expect(() => patchJsonSource(source, [{ op: "remove", path: ["items", 5] }])).toThrow();
  });
});

describe("patchJsonSource — batch operations", () => {
  it("applies multiple operations in sequence", () => {
    const source = JSON.stringify({ name: "app" }, null, 2);
    const result = patchJsonSource(source, [
      { op: "add", path: ["version"], value: "1.0.0" },
      { op: "add", path: ["enabled"], value: true },
      { op: "replace", path: ["version"], value: "2.0.0" },
    ]);
    const parsed = JSON.parse(result);
    expect(parsed.name).toBe("app");
    expect(parsed.version).toBe("2.0.0");
    expect(parsed.enabled).toBe(true);
  });

  it("returns the source unchanged for an empty operations array", () => {
    const source = JSON.stringify({ name: "app" }, null, 2);
    const result = patchJsonSource(source, []);
    expect(result).toBe(source);
  });

  it("skips failed operations when strict is false", () => {
    const source = JSON.stringify({ name: "app" }, null, 2);
    const result = patchJsonSource(
      source,
      [
        { op: "replace", path: ["missing"], value: "x" },
        { op: "add", path: ["version"], value: "1.0.0" },
      ],
      false,
    );
    expect(JSON.parse(result).version).toBe("1.0.0");
  });
});

describe("patchJsonSource — JSONC support", () => {
  it("preserves comments in JSONC", () => {
    const source = `{
  // Application name
  "name": "app"
}`;
    const result = patchJsonSource(source, [{ op: "add", path: ["version"], value: "1.0.0" }]);
    expect(result).toContain("// Application name");
    expect(JSON.parse(result.replace(/\/\/.*$/gm, ""))).toBeTruthy();
  });

  it("preserves trailing commas in JSONC", () => {
    const source = `{
  "name": "app",
}`;
    const result = patchJsonSource(source, [{ op: "add", path: ["version"], value: "1.0.0" }]);
    expect(result).toContain("app");
  });
});

describe("patchJsonSource — input validation", () => {
  it("throws for non-string source", () => {
    expect(() => patchJsonSource(null as unknown as string, [])).toThrow(TypeError);
    expect(() => patchJsonSource(42 as unknown as string, [])).toThrow(TypeError);
  });

  it("throws for non-array ops", () => {
    expect(() => patchJsonSource("{}", null as unknown as [])).toThrow(TypeError);
  });

  it("throws for invalid JSON source", () => {
    expect(() => patchJsonSource("{ invalid json", [{ op: "add", path: ["x"], value: 1 }])).toThrow();
  });

  it("throws for an unsupported operation type", () => {
    const source = JSON.stringify({ name: "app" }, null, 2);
    expect(() =>
      patchJsonSource(source, [{ op: "move" as never, path: ["a"], value: "b" }]),
    ).toThrow();
  });

  it("throws when add/replace is missing a value", () => {
    const source = JSON.stringify({ name: "app" }, null, 2);
    expect(() =>
      patchJsonSource(source, [{ op: "add", path: ["x"] } as never]),
    ).toThrow();
  });

  it("throws for an empty path", () => {
    const source = JSON.stringify({ name: "app" }, null, 2);
    expect(() => patchJsonSource(source, [{ op: "add", path: [], value: 1 }])).toThrow();
  });

  it("throws for a negative array index", () => {
    const source = JSON.stringify({ items: [] }, null, 2);
    expect(() =>
      patchJsonSource(source, [{ op: "add", path: ["items", -1], value: "x" }]),
    ).toThrow();
  });
});

describe("patchJsonSource — formatting preservation", () => {
  it("preserves 2-space indentation", () => {
    const source = JSON.stringify({ name: "app" }, null, 2);
    const result = patchJsonSource(source, [{ op: "add", path: ["version"], value: "1.0.0" }]);
    expect(result).toContain('  "version": "1.0.0"');
  });

  it("preserves the original key order", () => {
    const source = JSON.stringify({ b: 1, a: 2, c: 3 }, null, 2);
    const result = patchJsonSource(source, [{ op: "add", path: ["d"], value: 4 }]);
    const bIndex = result.indexOf('"b"');
    const aIndex = result.indexOf('"a"');
    const cIndex = result.indexOf('"c"');
    const dIndex = result.indexOf('"d"');
    expect(bIndex).toBeLessThan(aIndex);
    expect(aIndex).toBeLessThan(cIndex);
    expect(cIndex).toBeLessThan(dIndex);
  });
});
