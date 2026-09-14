import { describe, it, expect } from "vitest";
import { detectFormat } from "../src/utils/format-detect";
import type { ConfigFormat } from "../src/types";

describe("format detection", () => {
  it("detects yaml", () => {
    expect(detectFormat("config.yaml")).toBe<ConfigFormat>("yaml");
    expect(detectFormat("config.yml")).toBe<ConfigFormat>("yaml");
  });
  it("detects jsonc", () => {
    expect(detectFormat("tsconfig.jsonc")).toBe<ConfigFormat>("jsonc");
  });
  it("defaults to json", () => {
    expect(detectFormat("app.json")).toBe<ConfigFormat>("json");
  });
});
