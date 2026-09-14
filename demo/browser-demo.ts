/**
 * browser-demo.ts
 * Demo: Use the core layer (browser-safe) to patch configuration strings.
 * This works in browsers, IndexedDB, localStorage, or any storage layer.
 * No filesystem access is required.
 *
 * Run: ts-node demo/browser-demo.ts
 */
import {
  patchContent,
  setContentValue,
  deleteContentValue,
} from "../src/core";

function runBrowserDemo() {
  console.log("===== Browser-Safe Core Layer Demo =====\n");

  // 1. Patch a JSON string
  console.log("1. Patch JSON string:");
  const jsonConfig = JSON.stringify({ name: "my-app", version: "1.0.0" }, null, 2);
  const patchedJson = patchContent(
    jsonConfig,
    [
      { op: "add", path: ["description"], value: "My awesome application" },
      { op: "replace", path: ["version"], value: "1.1.0" },
    ],
    "json",
  );
  console.log(patchedJson);
  console.log();

  // 2. Set a nested value in YAML
  console.log("2. Set nested YAML value:");
  const yamlConfig = "name: my-app\nserver:\n  host: localhost\n";
  const updatedYaml = setContentValue(yamlConfig, ["server", "port"], 8080, "yaml");
  console.log(updatedYaml);
  console.log();

  // 3. Delete a value from JSONC (with comments preserved)
  console.log("3. Delete from JSONC (comments preserved):");
  const jsoncConfig = `{
  // Application name
  "name": "my-app",
  // Legacy feature flag
  "legacyFeature": true,
  "version": "1.0.0"
}`;
  const cleanedJsonc = deleteContentValue(jsoncConfig, ["legacyFeature"], "jsonc");
  console.log(cleanedJsonc);
  console.log();

  // 4. Set a boolean and number value
  console.log("4. Set boolean and number values:");
  const config = "{}";
  const withFeatures = setContentValue(config, ["features", "darkMode"], true, "json");
  const withLimit = setContentValue(withFeatures, ["features", "maxItems"], 100, "json");
  console.log(withLimit);
  console.log();

  // 5. Simulate browser storage (localStorage-like)
  console.log("5. Simulate browser storage:");
  const storage = new Map<string, string>();

  // Save config
  storage.set("app-config", JSON.stringify({ theme: "light", notifications: true }));
  console.log("Saved:", storage.get("app-config"));

  // Patch config in storage (no filesystem access)
  const current = storage.get("app-config")!;
  const updated = patchContent(
    current,
    [
      { op: "replace", path: ["theme"], value: "dark" },
      { op: "add", path: ["language"], value: "en-US" },
    ],
    "json",
  );
  storage.set("app-config", updated);
  console.log("Updated:", storage.get("app-config"));
  console.log();

  console.log("===== Demo Complete =====");
  console.log("All operations used the browser-safe core layer.");
  console.log("No filesystem access was required.");
}

runBrowserDemo();
