# @powerduck/conf-patch

[![npm version](https://img.shields.io/npm/v/@powerduck/conf-patch)](https://www.npmjs.com/package/@powerduck/conf-patch)
[![license](https://img.shields.io/npm/l/@powerduck/conf-patch)](https://github.com/powerducklab/conf-patch/blob/main/LICENSE)
[![downloads](https://img.shields.io/npm/dm/@powerduck/conf-patch)](https://www.npmjs.com/package/@powerduck/conf-patch)

Production-grade configuration file editor with a clean two-layer architecture: a browser-safe core layer for patching JSON/JSONC/YAML strings, and a Node.js/Electron file layer with atomic writes and cross-process file locking.

---

Powerduck is an open-source developer tooling platform for teams building modern API workflows.

- **Core Layer** — Browser-safe patching for JSON, JSONC, and YAML strings with no filesystem dependency
- **File Layer** — Atomic writes with temp-file + rename, cross-process file locking for Node.js/Electron
- **RFC 6902 JSON Patch** — `add`, `replace`, and `remove` operations with strict/non-strict modes
- **OpenAPI Validation** — Built on `@powerduck/openapi-parser` with secure input handling and DoS guards
- **Comment-Preserving Edits** — JSONC edits are range-based, preserving comments and trailing commas
- **Dual ESM/CJS** — Works with `import` and `require`, with bundled TypeScript declarations

---

## Quick Start

### Install

```bash
npm install @powerduck/conf-patch
```

### Patch a JSON string (browser-safe)

```typescript
import { patchContent } from "@powerduck/conf-patch/core";

const updated = patchContent(
  '{"name": "app", "version": "1.0.0"}',
  [
    { op: "replace", path: ["version"], value: "2.0.0" },
    { op: "add", path: ["description"], value: "My application" },
  ],
  "json",
);

console.log(updated);
```

### Set a value in a file (Node.js / Electron)

```typescript
import { setConfigValue } from "@powerduck/conf-patch";

// Atomic write with file locking
await setConfigValue("config.yaml", ["database", "port"], 5432);
```

---

## Links

- [Official Website](https://www.powerduck.com/opensource/conf-patch.html)
- [Documentation](https://www.powerduck.com/docs/conf-patch/introduction)
- [Live Demo](https://www.powerduck.com/demo/conf-patch)
- [GitHub](https://github.com/powerducklab/conf-patch)
- [npm](https://www.npmjs.com/package/@powerduck/conf-patch)

---

## Features

- **Two-layer architecture** — core layer runs in browsers, Edge Functions, and IndexedDB; file layer adds atomic writes and locking for Node.js/Electron
- **JSON, JSONC, and YAML support** — patch all three formats with one API
- **Comment-preserving edits** — JSONC edits are range-based, so comments and trailing commas around touched lines are preserved
- **RFC 6902 JSON Patch** — `add`, `replace`, and `remove` operations with strict/non-strict modes
- **Atomic writes** — temp file + rename, so a crash never leaves a half-written file
- **Cross-process file locking** — ownership tokens, exponential backoff, and stale-lock recovery
- **OpenAPI validation** — built on `@powerduck/openapi-parser` with secure input handling, size limits, and DoS guards
- **Format auto-detection** — file extension detection for `.json`, `.jsonc`, `.yaml`, `.yml`
- **Dual ESM/CJS builds** — works with `import` and `require`, with bundled TypeScript declarations

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     Application code                          │
├──────────────────────────────────────────────────────────────┤
│  File layer (Node.js / Electron only)                         │
│  ┌───────────────┐ ┌────────────────┐ ┌──────────────────┐  │
│  │ readConfigFile │ │ writeConfigFile│ │ patchConfigFile   │  │
│  │ setConfigValue │ │ deleteConfig…  │ │ withFileLock     │  │
│  └───────┬───────┘ └───────┬────────┘ └────────┬─────────┘  │
├──────────┼───────────────────┼─────────────────────┼──────────┤
│  Core layer (browser-safe, no filesystem)                    │
│  ┌───────────────┐ ┌────────────────┐ ┌──────────────────┐  │
│  │ patchContent   │ │ setContentValue│ │ deleteContentValue│  │
│  └───────────────┘ └────────────────┘ └──────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

---

## Core Layer (Browser-Safe)

Import from `@powerduck/conf-patch/core` for pure string operations with no filesystem access.

### `patchContent(content, operations, format)`

Patches a JSON/JSONC/YAML string with RFC 6902 operations.

```typescript
import { patchContent } from "@powerduck/conf-patch/core";

const result = patchContent(
  '{"a": 1, "b": 2}',
  [{ op: "replace", path: ["a"], value: 10 }],
  "json",
);
```

### `setContentValue(content, path, value, format)`

Convenience function to set a single value at a path.

```typescript
import { setContentValue } from "@powerduck/conf-patch/core";

const result = setContentValue(
  '{"server": {"port": 3000}}',
  ["server", "port"],
  8080,
  "json",
);
```

### `deleteContentValue(content, path, format)`

Delete a value at a path.

```typescript
import { deleteContentValue } from "@powerduck/conf-patch/core";

const result = deleteContentValue('{"a": 1, "b": 2}', ["b"], "json");
```

### `detectFormat(filePath)`

Detect format from file extension.

```typescript
import { detectFormat } from "@powerduck/conf-patch";

const format = detectFormat("./config.yaml"); // "yaml"
```

---

## File Layer (Node.js / Electron)

Import from `@powerduck/conf-patch` for filesystem operations with atomic writes and file locking.

### `readConfigFile(filePath, options?)`

Read and parse a config file.

```typescript
import { readConfigFile } from "@powerduck/conf-patch";

const config = await readConfigFile("./config.json");
console.log(config.value);
```

### `writeConfigFile(filePath, value, options?)`

Write a config value to a file with atomic write.

```typescript
import { writeConfigFile } from "@powerduck/conf-patch";

await writeConfigFile("./config.json", { name: "app", version: "1.0.0" });
```

### `setConfigValue(filePath, path, value, options?)`

Set a single value in a config file with atomic write and file locking.

```typescript
import { setConfigValue } from "@powerduck/conf-patch";

await setConfigValue("./config.yaml", ["database", "host"], "localhost");
```

### `patchConfigFile(filePath, operations, options?)`

Apply RFC 6902 patch operations to a config file.

```typescript
import { patchConfigFile } from "@powerduck/conf-patch";

await patchConfigFile("./config.json", [
  { op: "replace", path: ["version"], value: "2.0.0" },
  { op: "add", path: ["author"], value: "Powerduck" },
]);
```

### `withFileLock(filePath, callback, options?)`

Acquire a file lock and execute a callback.

```typescript
import { withFileLock } from "@powerduck/conf-patch";

await withFileLock("./config.json", async () => {
  // Critical section - no other process can modify the file
  await setConfigValue("./config.json", ["counter"], 42);
});
```

---

## OpenAPI Validation

Built-in OpenAPI spec validation with secure input handling.

### `validateOpenAPISpec(input, options?)`

Validate a raw YAML or JSON OpenAPI document.

```typescript
import {
  validateOpenAPISpec,
  OpenApiValidationError,
} from "@powerduck/conf-patch";

try {
  const doc = await validateOpenAPISpec(`
    openapi: 3.1.0
    info:
      title: Demo API
      version: 1.0.0
    paths: {}
  `);
  console.log("Valid. openapi =", doc.openapi);
} catch (error) {
  if (error instanceof OpenApiValidationError) {
    console.error(`[${error.code}]`, error.message);
  }
}
```

### `validateOpenAPIFile(filePath, options?)`

Validate an OpenAPI document from a local file.

```typescript
import { validateOpenAPIFile } from "@powerduck/conf-patch";

const doc = await validateOpenAPIFile("./openapi.json", {
  allowedRootDirectory: "./specs",
  maxInputBytes: 5 * 1024 * 1024,
});
```

### Validation Options

| Option                 | Type                  | Default     | Description                                                 |
| ---------------------- | --------------------- | ----------- | ----------------------------------------------------------- |
| `inputKind`            | `"content" \| "file"` | `"content"` | Whether input is raw content or a file path                 |
| `baseFilePath`         | `string`              | -           | Base file path for reference resolution                     |
| `allowedRootDirectory` | `string`              | -           | Root directory for file operations (required for file mode) |
| `timeoutMs`            | `number`              | `15000`     | Operation timeout in milliseconds                           |
| `maxInputBytes`        | `number`              | `5242880`   | Maximum input size in bytes                                 |
| `maxDocumentNodes`     | `number`              | `100000`    | Maximum nodes in parsed document                            |
| `maxDocumentDepth`     | `number`              | `100`       | Maximum nesting depth                                       |

---

## Error Codes

| Code                     | Description                                     |
| ------------------------ | ----------------------------------------------- |
| `INVALID_OPTION`         | Invalid option value provided                   |
| `FILE_INPUT_FORBIDDEN`   | File input requires `allowedRootDirectory`      |
| `PATH_OUTSIDE_ROOT`      | File path is outside the allowed root directory |
| `INPUT_TOO_LARGE`        | Input exceeds maximum allowed size              |
| `INPUT_FILE_TOO_LARGE`   | File exceeds maximum allowed size               |
| `PARSE_ERROR`            | Failed to parse the document                    |
| `INVALID_DOCUMENT_SHAPE` | Document is not a valid JSON object             |
| `UNSUPPORTED_VERSION`    | Unsupported OpenAPI/Swagger version             |
| `DOCUMENT_TOO_LARGE`     | Document exceeds maximum node count             |
| `DOCUMENT_TOO_DEEP`      | Document exceeds maximum nesting depth          |
| `SPEC_VALIDATION_FAILED` | OpenAPI validation failed                       |
| `OPERATION_TIMEOUT`      | Operation timed out                             |
| `OPERATION_ABORTED`      | Operation was aborted                           |
| `UNKNOWN_ERROR`          | Unknown error occurred                          |

---

## TypeScript Types

```typescript
import type {
  PatchOperation,
  ConfigFormat,
  ValidateOpenApiOptions,
  OpenApiValidationError,
  AnyOpenAPIDocument,
} from "@powerduck/conf-patch";
```

---

## License

MIT © [POWERDUCK LIMITED](https://www.powerduck.com)
