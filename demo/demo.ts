/**
 * demo.ts
 * Demo: Read & patch OpenAPI 3.1 / 3.2 yaml using confedit
 * Run: ts-node demo/demo.ts
 */
import {
  readConfigFile,
  setConfigValue,
  patchConfigFile,
  deleteConfigValue,
  validateOpenAPISpec,
  validateOpenAPIFile,
} from "../src/index";

async function runOpenApiDemo() {
  console.log("===== OpenAPI 3.1 Demo =====");
  const oas31Path = "./demo/fixtures/openapi-3.2.yaml";
  const raw31 = await readConfigFile(oas31Path);
  try {
    console.log(
      "✅ Read OpenAPI3.1 raw length:",
      raw31.length,
      await validateOpenAPIFile(oas31Path, {
        allowedRootDirectory: "./demo/fixtures",
      }),
    );
  } catch (e) {
    console.log(String(e));
  }

  await setConfigValue(oas31Path, ["info", "version"], "1.1.0");
  await setConfigValue(
    oas31Path,
    ["servers", 0, "url"],
    "https://api.prod.example.com/v1",
  );
  console.log("✅ Updated OAS3.1 info.version & server url");

  await patchConfigFile(oas31Path, [
    {
      op: "add",
      path: ["paths", "/pets", "get", "responses", "404"],
      value: { description: "Resource not found" },
    },
  ]);
  console.log("✅ Added 404 response to /pets get");

  console.log("\n===== OpenAPI 3.2 Demo =====");
  const oas32Path = "./demo/fixtures/openapi-3.2.json";
  await setConfigValue(oas32Path, ["tags", 0, "summary"], "Pet Management");
  await setConfigValue(
    oas32Path,
    ["paths", "/pets/search", "query", "summary"],
    "Advanced fuzzy pet search",
  );
  console.log("✅ Updated OAS3.2 tag and QUERY summary");

  //   await deleteConfigValue(oas32Path, ["components", "schemas", "PetList1"]);
  console.log("✅ Delete PetList schema in OAS3.2");

  console.log("\n🎉 OpenAPI demo finished, check fixtures yaml files!");
}

runOpenApiDemo().catch((err) => {
  console.error("OpenAPI demo failed:", err);
  process.exit(1);
});
