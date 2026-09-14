/**
 * Dual-module compatibility test.
 * Verifies that both require() and import() work for all entry points.
 * Run: node tests/dual-module.test.mjs
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const distDir = join(__dirname, "..", "dist");

describe("dual-module compatibility — require() (CommonJS)", () => {
  it("require('@powerduck/conf-patch') resolves to CJS build", () => {
    // Use direct path to dist since we're not in node_modules
    const mod = require(join(distDir, "index.js"));
    expect(typeof mod.patchContent).toBe("function");
    expect(typeof mod.setContentValue).toBe("function");
    expect(typeof mod.deleteContentValue).toBe("function");
    expect(typeof mod.readConfigFile).toBe("function");
    expect(typeof mod.writeConfigFile).toBe("function");
    expect(typeof mod.patchConfigFile).toBe("function");
    expect(typeof mod.setConfigValue).toBe("function");
    expect(typeof mod.deleteConfigValue).toBe("function");
    expect(typeof mod.validateOpenAPISpec).toBe("function");
    expect(typeof mod.validateOpenAPIFile).toBe("function");
    expect(typeof mod.OpenApiValidationError).toBe("function");
    expect(typeof mod.detectFormat).toBe("function");
    expect(typeof mod.normalizeFilePath).toBe("function");
  });

  it("require('@powerduck/conf-patch/core') resolves to CJS core build", () => {
    const mod = require(join(distDir, "core.js"));
    expect(typeof mod.patchContent).toBe("function");
    expect(typeof mod.setContentValue).toBe("function");
    expect(typeof mod.deleteContentValue).toBe("function");
    // Core should NOT export file-layer functions
    expect(mod.readConfigFile).toBeUndefined();
    expect(mod.writeConfigFile).toBeUndefined();
    expect(mod.patchConfigFile).toBeUndefined();
    expect(mod.setConfigValue).toBeUndefined();
    expect(mod.deleteConfigValue).toBeUndefined();
    expect(mod.validateOpenAPISpec).toBeUndefined();
  });

  it("CJS core build works correctly", () => {
    const { patchContent, setContentValue, deleteContentValue } = require(join(
      distDir,
      "core.js",
    ));

    const result = patchContent(
      '{"name": "app"}',
      [{ op: "add", path: ["version"], value: "1.0.0" }],
      "json",
    );
    expect(JSON.parse(result).version).toBe("1.0.0");

    const yaml = setContentValue("name: app\n", ["port"], 8080, "yaml");
    expect(yaml).toContain("port: 8080");

    const cleaned = deleteContentValue(
      '{"name": "app", "legacy": true}',
      ["legacy"],
      "json",
    );
    expect(JSON.parse(cleaned).legacy).toBeUndefined();
  });

  it("CJS main build works correctly", () => {
    const { patchContent, setContentValue } = require(join(distDir, "index.js"));

    const result = patchContent(
      '{"name": "app"}',
      [{ op: "add", path: ["version"], value: "1.0.0" }],
      "json",
    );
    expect(JSON.parse(result).version).toBe("1.0.0");
  });

  it("CJS build has __esModule marker for interop", () => {
    const mod = require(join(distDir, "index.js"));
    expect(mod.__esModule).toBe(true);
  });
});

describe("dual-module compatibility — import() (ES Module)", () => {
  it("import('@powerduck/conf-patch') resolves to ESM build", async () => {
    const mod = await import(pathToFileURL(join(distDir, "index.mjs")).href);
    expect(typeof mod.patchContent).toBe("function");
    expect(typeof mod.setContentValue).toBe("function");
    expect(typeof mod.deleteContentValue).toBe("function");
    expect(typeof mod.readConfigFile).toBe("function");
    expect(typeof mod.writeConfigFile).toBe("function");
    expect(typeof mod.patchConfigFile).toBe("function");
    expect(typeof mod.setConfigValue).toBe("function");
    expect(typeof mod.deleteConfigValue).toBe("function");
    expect(typeof mod.validateOpenAPISpec).toBe("function");
    expect(typeof mod.validateOpenAPIFile).toBe("function");
    expect(typeof mod.OpenApiValidationError).toBe("function");
  });

  it("import('@powerduck/conf-patch/core') resolves to ESM core build", async () => {
    const mod = await import(pathToFileURL(join(distDir, "core.mjs")).href);
    expect(typeof mod.patchContent).toBe("function");
    expect(typeof mod.setContentValue).toBe("function");
    expect(typeof mod.deleteContentValue).toBe("function");
    // Core should NOT export file-layer functions
    expect(mod.readConfigFile).toBeUndefined();
    expect(mod.writeConfigFile).toBeUndefined();
    expect(mod.patchConfigFile).toBeUndefined();
  });

  it("ESM core build works correctly", async () => {
    const { patchContent, setContentValue, deleteContentValue } = await import(
      pathToFileURL(join(distDir, "core.mjs")).href
    );

    const result = patchContent(
      '{"name": "app"}',
      [{ op: "add", path: ["version"], value: "1.0.0" }],
      "json",
    );
    expect(JSON.parse(result).version).toBe("1.0.0");

    const yaml = setContentValue("name: app\n", ["port"], 8080, "yaml");
    expect(yaml).toContain("port: 8080");
  });

  it("ESM main build works correctly", async () => {
    const { patchContent } = await import(
      pathToFileURL(join(distDir, "index.mjs")).href
    );

    const result = patchContent(
      '{"name": "app"}',
      [{ op: "add", path: ["version"], value: "1.0.0" }],
      "json",
    );
    expect(JSON.parse(result).version).toBe("1.0.0");
  });
});

describe("dual-module compatibility — CJS/ESM parity", () => {
  it("CJS and ESM produce identical results", async () => {
    const cjs = require(join(distDir, "core.js"));
    const esm = await import(pathToFileURL(join(distDir, "core.mjs")).href);

    const ops = [{ op: "add", path: ["version"], value: "1.0.0" }];
    const source = '{"name": "app"}';

    const cjsResult = cjs.patchContent(source, ops, "json");
    const esmResult = esm.patchContent(source, ops, "json");

    expect(cjsResult).toBe(esmResult);
  });

  it("CJS and ESM core have the same exports", async () => {
    const cjs = require(join(distDir, "core.js"));
    const esm = await import(pathToFileURL(join(distDir, "core.mjs")).href);

    const cjsExports = Object.keys(cjs).filter((k) => k !== "__esModule");
    const esmExports = Object.keys(esm);

    expect(cjsExports.sort()).toEqual(esmExports.sort());
  });
});

describe("package.json exports field", () => {
  it("has correct main entry for CJS", async () => {
    const pkg = JSON.parse(
      await import("node:fs/promises").then((fs) =>
        fs.readFile(join(__dirname, "..", "package.json"), "utf8"),
      ),
    );
    expect(pkg.main).toBe("dist/index.js");
    expect(pkg.module).toBe("dist/index.mjs");
    expect(pkg.exports["."].require).toBe("./dist/index.js");
    expect(pkg.exports["."].import).toBe("./dist/index.mjs");
    expect(pkg.exports["./core"].require).toBe("./dist/core.js");
    expect(pkg.exports["./core"].import).toBe("./dist/core.mjs");
  });

  it("does not set type: module (so .js is CJS by default)", async () => {
    const pkg = JSON.parse(
      await import("node:fs/promises").then((fs) =>
        fs.readFile(join(__dirname, "..", "package.json"), "utf8"),
      ),
    );
    expect(pkg.type).toBeUndefined();
  });
});
