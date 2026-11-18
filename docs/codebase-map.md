# Codebase map

## Generation flow

1. `src/lib/decorators.ts` records ToolMeta and ToolProp metadata using
   reflect-metadata. It also records permanent add/update operations, including
   deferred operations on nested classes.
2. `src/lib/core.ts` implements classToJsonSchema. It assembles inherited metadata,
   builds nested classes, applies recorded updates and per-call overrides, detects
   recursion and optionally prepares structured output.
3. `src/lib/resolve.ts` resolves properties at generation time. Explicit options
   take precedence over class-validator inference, then TypeScript design types.
   It handles nullable schemas, arrays, required properties and object closure.
4. `src/lib/llm-formats.ts` wraps generated or caller-provided JSON Schema for
   OpenAI Chat Completions / Responses, Anthropic, old and new Gemini APIs and
   Vertex. Gemini keyword filtering and description fallbacks live here.
5. `src/lib/strict-schema.ts` implements separate OpenAI and Anthropic strict
   policies. Optionality, object closure and unsupported keywords are not the
   same contract across providers.

## Supporting modules

| Module | Responsibility |
| --- | --- |
| `src/lib/class-validator-integration.ts` | Lazily loads optional class-validator and infers constraints from its metadata |
| `src/lib/utils.ts` | Copies metadata/options, normalizes constructors/enums and checks update paths |
| `src/lib/types.ts` | Public JSON Schema definitions, decorator options and provider contracts |
| `src/lib/vertex-api.type.ts` | Local Vertex SchemaType enum |
| `src/lib/index.ts` | Public exports, aliases and Schema namespace |
| `src/schema-forge.ts` | Deprecated import-path compatibility re-export |

## Tests

| Path | What it proves |
| --- | --- |
| `src/schema-forge.spec.ts` | Conversion, updates, inheritance and provider snapshots |
| `src/__snapshots__/schema-forge.spec.ts.snap` | Recorded conversion output |
| `src/lib/resolve.spec.ts` | Precedence, isolation, nullable/array/nested schemas and errors |
| `src/lib/strict-schema.spec.ts` | Offline provider strict-policy assertions |
| `src/lib/class-validator-integration.spec.ts` | Inferred array constraints |
| `src/readme-examples.spec.ts` | README examples and TypeScript compilation |
| `src/llm-tool.spec.ts` | Live provider tools and structured outputs |
| `src/llm-schema-v3.spec.ts` | Live schema shapes and strict-keyword acceptance |

`jest.config.ts` discovers all spec files. `tsconfig.json` includes specs;
`tsconfig.build.json` excludes them from published output. See `AGENTS.md` for
offline and credentialed commands. SDK type acceptance alone does not prove
that a provider accepts the wire schema.
