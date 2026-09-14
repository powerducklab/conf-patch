import { describe, it, expect } from "vitest";
import { patchYamlSource } from "../src/parsers/yaml-patch.js";

function parseYaml(source: string): Record<string, unknown> {
  // Use a simple parser for test assertions
  const lines = source.split("\n");
  const result: Record<string, unknown> = {};
  let currentKey: string | null = null;
  for (const line of lines) {
    if (line.startsWith("  ") && currentKey) {
      const [k, v] = line.trim().split(": ");
      if (k && v !== undefined) {
        (result[currentKey] as Record<string, unknown>)[k] = v;
      }
    } else if (line.includes(": ")) {
      const [k, v] = line.split(": ");
      if (k && v !== undefined) {
        result[k] = v;
        currentKey = k;
      }
    } else if (line.endsWith(":")) {
      currentKey = line.slice(0, -1);
      result[currentKey] = {};
    }
  }
  return result;
}

describe("patchYamlSource — add operation", () => {
  it("adds a top-level property", () => {
    const source = "name: app\n";
    const result = patchYamlSource(source, [{ op: "add", path: ["version"], value: "1.0.0" }]);
    expect(result).toContain("version: 1.0.0");
    expect(result).toContain("name: app");
  });

  it("adds a nested property", () => {
    const source = "server:\n  host: localhost\n";
    const result = patchYamlSource(source, [
      { op: "add", path: ["server", "port"], value: 8080 },
    ]);
    expect(result).toContain("port: 8080");
  });

  it("adds an item to a sequence", () => {
    const source = "items:\n  - a\n  - c\n";
    const result = patchYamlSource(source, [
      { op: "add", path: ["items", 1], value: "b" },
    ]);
    expect(result).toContain("- b");
  });

  it("adds a boolean value", () => {
    const source = "name: app\n";
    const result = patchYamlSource(source, [{ op: "add", path: ["enabled"], value: true }]);
    expect(result).toContain("enabled: true");
  });

  it("adds a number value", () => {
    const source = "name: app\n";
    const result = patchYamlSource(source, [{ op: "add", path: ["count"], value: 42 }]);
    expect(result).toContain("count: 42");
  });

  it("replaces an existing property with add", () => {
    const source = "version: 1.0.0\n";
    const result = patchYamlSource(source, [
      { op: "add", path: ["version"], value: "2.0.0" },
    ]);
    expect(result).toContain("version: 2.0.0");
    expect(result).not.toContain("version: 1.0.0");
  });

  it("throws when adding at an out-of-bounds sequence index", () => {
    const source = "items:\n  - a\n";
    expect(() =>
      patchYamlSource(source, [{ op: "add", path: ["items", 5], value: "x" }]),
    ).toThrow();
  });

  it("throws when the parent path does not exist", () => {
    const source = "name: app\n";
    expect(() =>
      patchYamlSource(source, [{ op: "add", path: ["missing", "key"], value: "x" }]),
    ).toThrow();
  });

  it("throws when adding to a scalar parent", () => {
    const source = "name: app\n";
    expect(() =>
      patchYamlSource(source, [{ op: "add", path: ["name", "extra"], value: "x" }]),
    ).toThrow();
  });
});

describe("patchYamlSource — replace operation", () => {
  it("replaces an existing property", () => {
    const source = "version: 1.0.0\n";
    const result = patchYamlSource(source, [
      { op: "replace", path: ["version"], value: "2.0.0" },
    ]);
    expect(result).toContain("version: 2.0.0");
  });

  it("replaces a nested property", () => {
    const source = "server:\n  port: 3000\n";
    const result = patchYamlSource(source, [
      { op: "replace", path: ["server", "port"], value: 8080 },
    ]);
    expect(result).toContain("port: 8080");
  });

  it("replaces a sequence item", () => {
    const source = "items:\n  - a\n  - b\n  - c\n";
    const result = patchYamlSource(source, [
      { op: "replace", path: ["items", 1], value: "x" },
    ]);
    expect(result).toContain("- x");
  });

  it("throws when replacing a non-existent property", () => {
    const source = "name: app\n";
    expect(() =>
      patchYamlSource(source, [{ op: "replace", path: ["missing"], value: "x" }]),
    ).toThrow();
  });

  it("throws when replacing an out-of-bounds sequence index", () => {
    const source = "items:\n  - a\n";
    expect(() =>
      patchYamlSource(source, [{ op: "replace", path: ["items", 5], value: "x" }]),
    ).toThrow();
  });
});

describe("patchYamlSource — remove operation", () => {
  it("removes an existing property", () => {
    const source = "name: app\nversion: 1.0.0\n";
    const result = patchYamlSource(source, [{ op: "remove", path: ["version"] }]);
    expect(result).toContain("name: app");
    expect(result).not.toContain("version:");
  });

  it("removes a nested property", () => {
    const source = "server:\n  host: localhost\n  port: 3000\n";
    const result = patchYamlSource(source, [{ op: "remove", path: ["server", "port"] }]);
    expect(result).toContain("host: localhost");
    expect(result).not.toContain("port:");
  });

  it("removes a sequence item", () => {
    const source = "items:\n  - a\n  - b\n  - c\n";
    const result = patchYamlSource(source, [{ op: "remove", path: ["items", 1] }]);
    expect(result).not.toContain("- b");
  });

  it("throws when removing a non-existent property", () => {
    const source = "name: app\n";
    expect(() => patchYamlSource(source, [{ op: "remove", path: ["missing"] }])).toThrow();
  });

  it("throws when removing an out-of-bounds sequence index", () => {
    const source = "items:\n  - a\n";
    expect(() => patchYamlSource(source, [{ op: "remove", path: ["items", 5] }])).toThrow();
  });
});

describe("patchYamlSource — batch operations", () => {
  it("applies multiple operations in sequence", () => {
    const source = "name: app\n";
    const result = patchYamlSource(source, [
      { op: "add", path: ["version"], value: "1.0.0" },
      { op: "add", path: ["enabled"], value: true },
      { op: "replace", path: ["version"], value: "2.0.0" },
    ]);
    expect(result).toContain("version: 2.0.0");
    expect(result).toContain("enabled: true");
  });

  it("returns the source unchanged for an empty operations array", () => {
    const source = "name: app\n";
    const result = patchYamlSource(source, []);
    expect(result).toBe(source);
  });

  it("skips failed operations when strict is false", () => {
    const source = "name: app\n";
    const result = patchYamlSource(
      source,
      [
        { op: "replace", path: ["missing"], value: "x" },
        { op: "add", path: ["version"], value: "1.0.0" },
      ],
      false,
    );
    expect(result).toContain("version: 1.0.0");
  });
});

describe("patchYamlSource — input validation", () => {
  it("throws for invalid YAML source", () => {
    expect(() =>
      patchYamlSource(":\n  invalid: [", [{ op: "add", path: ["x"], value: 1 }]),
    ).toThrow();
  });

  it("throws for an unsupported operation type", () => {
    expect(() =>
      patchYamlSource("name: app\n", [{ op: "move" as never, path: ["a"], value: "b" }]),
    ).toThrow();
  });

  it("throws for an empty path", () => {
    expect(() => patchYamlSource("name: app\n", [{ op: "add", path: [], value: 1 }])).toThrow();
  });

  it("throws for an empty YAML document", () => {
    expect(() =>
      patchYamlSource("", [{ op: "add", path: ["x"], value: 1 }]),
    ).toThrow();
  });

  it("throws for a scalar root document", () => {
    expect(() =>
      patchYamlSource("just a string\n", [{ op: "add", path: ["x"], value: 1 }]),
    ).toThrow();
  });
});

describe("patchYamlSource — formatting preservation", () => {
  it("preserves comments", () => {
    const source = "# Application config\nname: app\n";
    const result = patchYamlSource(source, [{ op: "add", path: ["version"], value: "1.0.0" }]);
    expect(result).toContain("# Application config");
  });

  it("preserves the original key order", () => {
    const source = "b: 1\na: 2\nc: 3\n";
    const result = patchYamlSource(source, [{ op: "add", path: ["d"], value: 4 }]);
    const bIndex = result.indexOf("b:");
    const aIndex = result.indexOf("a:");
    const cIndex = result.indexOf("c:");
    const dIndex = result.indexOf("d:");
    expect(bIndex).toBeLessThan(aIndex);
    expect(aIndex).toBeLessThan(cIndex);
    expect(cIndex).toBeLessThan(dIndex);
  });
});
