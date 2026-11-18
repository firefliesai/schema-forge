# Review contract

Read `AGENTS.md` first. Report a concrete trigger, code path and consumer impact
for each finding, with file/line evidence. Distinguish a failed live check from
an assumption about a provider. Flag the following.

## Public API and compatibility

- Removed or changed exports, aliases, Schema namespace members or declaration
  types in `src/lib/index.ts` without an explicit breaking-change explanation.
- A changed emitted schema, error contract or option default missing from
  `CHANGELOG.md` and consumer documentation in `README.md`.
- Release version changes inconsistent between `package.json` and
  `package-lock.json`. Maintenance-only changes need not bump a version.

## Metadata and resolution

- Mutation of inputs, inherited metadata or prior results, especially nested
  updates and array enum/items paths in `src/lib/decorators.ts` and `src/lib/core.ts`.
- Changed explicit-option / validator / design-type precedence in
  `src/lib/resolve.ts`, decorator-order dependence, missing unknown-type or
  recursive-class errors, or regression in nullable versus optional semantics.
- Eager mandatory imports of optional class-validator in
  `src/lib/class-validator-integration.ts`.
- Reflect metadata assumptions tested only on one peer range. CI in
  `.github/workflows/ci.yml` exercises both 0.1.14 and 0.2.

## Provider formats

- Treating OpenAI Chat Completions and Responses wrappers as interchangeable,
  or sharing OpenAI and Anthropic strict policies without output assertions.
- Keyword loss, changed required/nullable behavior, or unsupported keywords
  leaking through Gemini old/new or Vertex adapters in `src/lib/llm-formats.ts`.
- A provider-compatibility claim supported only by SDK types or snapshots.
  Relevant live suites are `src/llm-tool.spec.ts` and `src/llm-schema-v3.spec.ts`;
  absent credentials must be called out, not replaced with a passing claim.

## Verification evidence

- Snapshot churn in `src/__snapshots__/schema-forge.spec.ts.snap` without a
  behavioral explanation and assertions for the intended output.
- New behavior lacking normal, empty and error coverage where applicable.
- Claims that build covers specs. Only the spec-inclusive typecheck does.
- Guidance links that drift, duplicate skill copies, or hook changes without
  self-tests. `scripts/agent-check.sh` checks these independently of API keys.
