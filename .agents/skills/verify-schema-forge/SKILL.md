---
name: verify-schema-forge
description: Verify schema-forge library changes offline, smoke-test the built package, and identify when live provider checks are needed.
---

# Verify Schema Forge

Run from the repository root after reading AGENTS.md.

## Offline checks

```bash
npm ci
bash scripts/agent-check.sh
npm run lint
npm run format:check
npm run typecheck
touch .env
npm run jest -- --runInBand --testPathIgnorePatterns='llm-tool.spec.ts|llm-schema-v3.spec.ts|node_modules|dist'
npm run build
```

An empty .env satisfies env-cmd. This command excludes both live provider
suites before module loading. The remaining suites need no API keys.

## Built-package smoke test

Run after build. This uses the public entry, not source-only imports.

```bash
node <<'NODE'
const assert = require('node:assert/strict');
require('reflect-metadata');
const { ToolProp, classToJsonSchema } = require('./dist/lib/index.js');
class Example {}
ToolProp({ type: 'string', description: 'A label' })(Example.prototype, 'label');
const schema = classToJsonSchema(Example);
assert.equal(schema.properties.label.type, 'string');
assert.ok(schema.required.includes('label'));
console.log(JSON.stringify(schema, null, 2));
NODE
```

## Choose additional evidence

- Resolution changes need assertions for repeated generation, inheritance,
  option copying, overrides and errors in the relevant offline spec.
- Expected schema changes may alter snapshots. Use a specific test path with
  `npm run jest:u -- --runInBand src/schema-forge.spec.ts`, then inspect the diff.
  A regenerated snapshot is not an independent assertion of correctness.
- Changes to provider adapters or strict policies need relevant real API checks
  with provisioned credentials. `touch .env && npm test` runs every suite.
  The live suites require OPENAI_API_KEY, ANTHROPIC_API_KEY and GEMINI_API_KEY
  and may incur charges. Never add credentials to tracked files or logs.
- CI also exercises both supported reflect-metadata families. For metadata
  changes, check both versions in disposable installs rather than silently
  updating the lockfile in your working tree.

Report commands, asserted output, snapshot changes and any unverified live
provider behavior. Do not describe offline schema checks as live acceptance.
