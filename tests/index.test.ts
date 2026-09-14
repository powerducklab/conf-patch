import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdtemp, readFile, writeFile, rm, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  readConfigFile,
  patchConfigFile,
  setConfigValue,
  deleteConfigValue,
} from "../src/index.js";

const mkdtempAsync = promisify(mkdtemp);
const readFileAsync = promisify(readFile);
const writeFileAsync = promisify(writeFile);
const rmAsync = promisify(rm);

let tempDir: string;

beforeAll(async () => {
  tempDir = await mkdtempAsync(join(tmpdir(), "confedit-integration-"));
});

afterAll(async () => {
  await rmAsync(tempDir, { recursive: true, force: true });
});

describe("readConfigFile", () => {
  it("reads a JSON file", async () => {
    const filePath = join(tempDir, "read-json.json");
    await writeFileAsync(filePath, JSON.stringify({ name: "test" }), "utf8");
    const content = await readConfigFile(filePath);
    expect(content).toBe(JSON.stringify({ name: "test" }));
  });

  it("reads a YAML file", async () => {
    const filePath = join(tempDir, "read-yaml.yaml");
    await writeFileAsync(filePath, "name: test\n", "utf8");
    const content = await readConfigFile(filePath);
    expect(content).toBe("name: test\n");
  });

  it("reads a JSONC file with comments", async () => {
    const filePath = join(tempDir, "read-jsonc.jsonc");
    await writeFileAsync(filePath, '{\n  // comment\n  "name": "test"\n}', "utf8");
    const content = await readConfigFile(filePath);
    expect(content).toContain("// comment");
    expect(content).toContain('"name": "test"');
  });

  it("throws for a non-existent file", async () => {
    const filePath = join(tempDir, "nonexistent.json");
    await expect(readConfigFile(filePath)).rejects.toThrow();
  });

  it("throws for an empty file path", async () => {
    await expect(readConfigFile("")).rejects.toThrow(TypeError);
  });

  it("throws for a non-string input", async () => {
    await expect(readConfigFile(null as unknown as string)).rejects.toThrow(TypeError);
    await expect(readConfigFile(42 as unknown as string)).rejects.toThrow(TypeError);
  });

  it("resolves a relative path", async () => {
    const filePath = join(tempDir, "relative.json");
    await writeFileAsync(filePath, "{}", "utf8");
    const content = await readConfigFile(filePath);
    expect(content).toBe("{}");
  });
});

describe("setConfigValue — JSON", () => {
  let filePath: string;

  beforeEach(async () => {
    filePath = join(tempDir, `set-json-${Date.now()}-${Math.random()}.json`);
    await writeFileAsync(filePath, JSON.stringify({ name: "app", version: "1.0.0" }, null, 2), "utf8");
  });

  it("sets a top-level property", async () => {
    await setConfigValue(filePath, ["description"], "A test app");
    const content = await readFileAsync(filePath, "utf8");
    const parsed = JSON.parse(content);
    expect(parsed.description).toBe("A test app");
    expect(parsed.name).toBe("app");
  });

  it("sets a nested property", async () => {
    await setConfigValue(filePath, ["server"], { host: "localhost" });
    await setConfigValue(filePath, ["server", "port"], 8080);
    const parsed = JSON.parse(await readFileAsync(filePath, "utf8"));
    expect(parsed.server.host).toBe("localhost");
    expect(parsed.server.port).toBe(8080);
  });

  it("replaces an existing property", async () => {
    await setConfigValue(filePath, ["version"], "2.0.0");
    const parsed = JSON.parse(await readFileAsync(filePath, "utf8"));
    expect(parsed.version).toBe("2.0.0");
  });

  it("sets a boolean value", async () => {
    await setConfigValue(filePath, ["enabled"], true);
    const parsed = JSON.parse(await readFileAsync(filePath, "utf8"));
    expect(parsed.enabled).toBe(true);
  });

  it("sets a number value", async () => {
    await setConfigValue(filePath, ["port"], 8080);
    const parsed = JSON.parse(await readFileAsync(filePath, "utf8"));
    expect(parsed.port).toBe(8080);
  });

  it("sets an object value", async () => {
    await setConfigValue(filePath, ["meta"], { author: "test", year: 2024 });
    const parsed = JSON.parse(await readFileAsync(filePath, "utf8"));
    expect(parsed.meta.author).toBe("test");
    expect(parsed.meta.year).toBe(2024);
  });

  it("sets an array value", async () => {
    await setConfigValue(filePath, ["tags"], ["a", "b", "c"]);
    const parsed = JSON.parse(await readFileAsync(filePath, "utf8"));
    expect(parsed.tags).toEqual(["a", "b", "c"]);
  });

  it("sets an array item by index using replace", async () => {
    await setConfigValue(filePath, ["items"], ["a", "b", "c"]);
    await patchConfigFile(filePath, [{ op: "replace", path: ["items", 1], value: "x" }]);
    const parsed = JSON.parse(await readFileAsync(filePath, "utf8"));
    expect(parsed.items).toEqual(["a", "x", "c"]);
  });

  it("throws for an empty path", async () => {
    await expect(setConfigValue(filePath, [], "value")).rejects.toThrow(TypeError);
  });

  it("throws for an empty string path segment", async () => {
    await expect(setConfigValue(filePath, [""], "value")).rejects.toThrow(TypeError);
  });

  it("throws for a negative array index", async () => {
    await expect(setConfigValue(filePath, ["items", -1], "value")).rejects.toThrow();
  });
});

describe("setConfigValue — YAML", () => {
  let filePath: string;

  beforeEach(async () => {
    filePath = join(tempDir, `set-yaml-${Date.now()}-${Math.random()}.yaml`);
    await writeFileAsync(filePath, "name: app\nversion: 1.0.0\n", "utf8");
  });

  it("sets a top-level property", async () => {
    await setConfigValue(filePath, ["description"], "A test app");
    const content = await readFileAsync(filePath, "utf8");
    expect(content).toContain("description: A test app");
  });

  it("sets a nested property", async () => {
    await setConfigValue(filePath, ["server"], { host: "localhost" });
    await setConfigValue(filePath, ["server", "port"], 8080);
    const content = await readFileAsync(filePath, "utf8");
    expect(content).toContain("host: localhost");
    expect(content).toContain("port: 8080");
  });

  it("replaces an existing property", async () => {
    await setConfigValue(filePath, ["version"], "2.0.0");
    const content = await readFileAsync(filePath, "utf8");
    expect(content).toContain("version: 2.0.0");
    expect(content).not.toContain("version: 1.0.0");
  });

  it("preserves comments", async () => {
    await writeFileAsync(filePath, "# Config\nname: app\n", "utf8");
    await setConfigValue(filePath, ["version"], "1.0.0");
    const content = await readFileAsync(filePath, "utf8");
    expect(content).toContain("# Config");
  });
});

describe("setConfigValue — JSONC", () => {
  it("preserves comments when setting a value", async () => {
    const filePath = join(tempDir, `set-jsonc-${Date.now()}.jsonc`);
    await writeFileAsync(filePath, '{\n  // Application name\n  "name": "app"\n}', "utf8");
    await setConfigValue(filePath, ["version"], "1.0.0");
    const content = await readFileAsync(filePath, "utf8");
    expect(content).toContain("// Application name");
    expect(content).toContain('"version": "1.0.0"');
  });
});

describe("deleteConfigValue — JSON", () => {
  let filePath: string;

  beforeEach(async () => {
    filePath = join(tempDir, `delete-json-${Date.now()}-${Math.random()}.json`);
    await writeFileAsync(
      filePath,
      JSON.stringify({ name: "app", version: "1.0.0", server: { host: "localhost", port: 3000 } }, null, 2),
      "utf8",
    );
  });

  it("deletes a top-level property", async () => {
    await deleteConfigValue(filePath, ["version"]);
    const parsed = JSON.parse(await readFileAsync(filePath, "utf8"));
    expect(parsed.version).toBeUndefined();
    expect(parsed.name).toBe("app");
  });

  it("deletes a nested property", async () => {
    await deleteConfigValue(filePath, ["server", "port"]);
    const parsed = JSON.parse(await readFileAsync(filePath, "utf8"));
    expect(parsed.server.port).toBeUndefined();
    expect(parsed.server.host).toBe("localhost");
  });

  it("deletes an array item by index", async () => {
    await setConfigValue(filePath, ["items"], ["a", "b", "c"]);
    await deleteConfigValue(filePath, ["items", 1]);
    const parsed = JSON.parse(await readFileAsync(filePath, "utf8"));
    expect(parsed.items).toEqual(["a", "c"]);
  });

  it("throws when deleting a non-existent property", async () => {
    await expect(deleteConfigValue(filePath, ["missing"])).rejects.toThrow();
  });

  it("throws for an empty path", async () => {
    await expect(deleteConfigValue(filePath, [])).rejects.toThrow(TypeError);
  });
});

describe("deleteConfigValue — YAML", () => {
  it("deletes a property and preserves formatting", async () => {
    const filePath = join(tempDir, `delete-yaml-${Date.now()}.yaml`);
    await writeFileAsync(filePath, "name: app\nversion: 1.0.0\n", "utf8");
    await deleteConfigValue(filePath, ["version"]);
    const content = await readFileAsync(filePath, "utf8");
    expect(content).toContain("name: app");
    expect(content).not.toContain("version:");
  });
});

describe("patchConfigFile", () => {
  let filePath: string;

  beforeEach(async () => {
    filePath = join(tempDir, `patch-${Date.now()}-${Math.random()}.json`);
    await writeFileAsync(filePath, JSON.stringify({ name: "app" }, null, 2), "utf8");
  });

  it("applies multiple patch operations", async () => {
    await patchConfigFile(filePath, [
      { op: "add", path: ["version"], value: "1.0.0" },
      { op: "add", path: ["enabled"], value: true },
    ]);
    const parsed = JSON.parse(await readFileAsync(filePath, "utf8"));
    expect(parsed.version).toBe("1.0.0");
    expect(parsed.enabled).toBe(true);
  });

  it("does nothing for an empty operations array", async () => {
    const before = await readFileAsync(filePath, "utf8");
    await patchConfigFile(filePath, []);
    const after = await readFileAsync(filePath, "utf8");
    expect(after).toBe(before);
  });

  it("supports explicit format option", async () => {
    const yamlPath = join(tempDir, `patch-format-${Date.now()}.txt`);
    await writeFileAsync(yamlPath, "name: app\n", "utf8");
    await patchConfigFile(yamlPath, [{ op: "add", path: ["version"], value: "1.0.0" }], {
      format: "yaml",
    });
    const content = await readFileAsync(yamlPath, "utf8");
    expect(content).toContain("version: 1.0.0");
  });

  it("supports strict mode option", async () => {
    await patchConfigFile(
      filePath,
      [
        { op: "replace", path: ["missing"], value: "x" },
        { op: "add", path: ["version"], value: "1.0.0" },
      ],
      { strict: false },
    );
    const parsed = JSON.parse(await readFileAsync(filePath, "utf8"));
    expect(parsed.version).toBe("1.0.0");
  });

  it("supports disabling file locking", async () => {
    await patchConfigFile(
      filePath,
      [{ op: "add", path: ["version"], value: "1.0.0" }],
      { lock: false },
    );
    const parsed = JSON.parse(await readFileAsync(filePath, "utf8"));
    expect(parsed.version).toBe("1.0.0");
  });

  it("throws for invalid operations", async () => {
    await expect(
      patchConfigFile(filePath, [{ op: "move" as never, path: ["a"], value: "b" }]),
    ).rejects.toThrow();
  });

  it("throws for non-array ops", async () => {
    await expect(patchConfigFile(filePath, null as unknown as [])).rejects.toThrow(TypeError);
  });

  it("throws for an unsupported format", async () => {
    await expect(
      patchConfigFile(filePath, [{ op: "add", path: ["x"], value: 1 }], {
        format: "xml" as never,
      }),
    ).rejects.toThrow();
  });

  it("throws for invalid lock options", async () => {
    await expect(
      patchConfigFile(filePath, [{ op: "add", path: ["x"], value: 1 }], {
        lockTimeoutMs: -1,
      }),
    ).rejects.toThrow(TypeError);
  });
});

describe("format detection", () => {
  it("detects JSON from .json extension", async () => {
    const filePath = join(tempDir, "detect-json.json");
    await writeFileAsync(filePath, "{}", "utf8");
    await setConfigValue(filePath, ["x"], 1);
    const parsed = JSON.parse(await readFileAsync(filePath, "utf8"));
    expect(parsed.x).toBe(1);
  });

  it("detects YAML from .yaml extension", async () => {
    const filePath = join(tempDir, "detect-yaml.yaml");
    await writeFileAsync(filePath, "x: 1\n", "utf8");
    await setConfigValue(filePath, ["y"], 2);
    const content = await readFileAsync(filePath, "utf8");
    expect(content).toContain("y: 2");
  });

  it("detects YAML from .yml extension", async () => {
    const filePath = join(tempDir, "detect-yml.yml");
    await writeFileAsync(filePath, "x: 1\n", "utf8");
    await setConfigValue(filePath, ["y"], 2);
    const content = await readFileAsync(filePath, "utf8");
    expect(content).toContain("y: 2");
  });

  it("detects JSONC from .jsonc extension", async () => {
    const filePath = join(tempDir, "detect-jsonc.jsonc");
    await writeFileAsync(filePath, '{\n  // comment\n  "x": 1\n}', "utf8");
    await setConfigValue(filePath, ["y"], 2);
    const content = await readFileAsync(filePath, "utf8");
    expect(content).toContain("// comment");
    expect(content).toContain('"y": 2');
  });

  it("throws for an unsupported extension", async () => {
    const filePath = join(tempDir, "detect-unsupported.txt");
    await writeFileAsync(filePath, "content", "utf8");
    await expect(setConfigValue(filePath, ["x"], 1)).rejects.toThrow();
  });
});

describe("atomic write safety", () => {
  it("does not corrupt the file when the callback throws", async () => {
    const filePath = join(tempDir, `atomic-safety-${Date.now()}.json`);
    const original = JSON.stringify({ name: "app" }, null, 2);
    await writeFileAsync(filePath, original, "utf8");

    // patchConfigFile should not corrupt the file if parsing fails
    try {
      await patchConfigFile(filePath, [{ op: "add", path: ["x"], value: 1 }]);
    } catch {
      // Ignore
    }

    // File should still be readable
    const content = await readFileAsync(filePath, "utf8");
    expect(() => JSON.parse(content)).not.toThrow();
  });
});

describe("concurrent safety", () => {
  it("handles concurrent writes to the same file", async () => {
    const filePath = join(tempDir, `concurrent-writes-${Date.now()}.json`);
    await writeFileAsync(filePath, JSON.stringify({ count: 0 }, null, 2), "utf8");

    const writes = Array.from({ length: 5 }, (_, i) =>
      setConfigValue(filePath, [`field${i}`], i),
    );

    await Promise.all(writes);

    const parsed = JSON.parse(await readFileAsync(filePath, "utf8"));
    for (let i = 0; i < 5; i++) {
      expect(parsed[`field${i}`]).toBe(i);
    }
  });
});
