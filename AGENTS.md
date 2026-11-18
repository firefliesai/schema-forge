# Schema Forge

This is the source of truth for agents working on this TypeScript library.
It converts decorated classes to JSON Schema and provider-specific tool and
structured-output formats. It generates schemas, not runtime validators or API calls.

## Start here

| Path | Contents / guide |
| --- | --- |
| `src/lib/index.ts` | Published exports and compatibility namespace |
| `src/lib/decorators.ts` | Class/property metadata and schema updates |
| `src/lib/resolve.ts` | Generation-time precedence and nested-property resolution |
| `src/lib/core.ts` | Class to JSON Schema generation |
| `src/lib/llm-formats.ts` | OpenAI, Anthropic, Gemini and Vertex adapters |
| `src/lib/strict-schema.ts` | Provider-specific strict transformations |
| `src/lib/class-validator-integration.ts` | Optional validator inference |
| `src/lib/types.ts` | Schema, options and provider types |
| `src/lib/utils.ts` | Copying, enum and property-path helpers |
| `src/lib/vertex-api.type.ts` | Local Vertex enum |
| `src/schema-forge.ts` | Legacy re-export entry |
| `src/fixture/` | Decorated examples used in tests |
| `docs/codebase-map.md` | Data flow and test map |
| `README.md` | Consumer usage and supported options |
| `REVIEW.md` | Review checklist |
| `.agents/skills/verify-schema-forge/SKILL.md` | Verification recipe and built-package smoke test |

## Commands

Node 20 matches CI. Run commands at the repository root.

| Task | Command |
| --- | --- |
| Install | `npm ci` |
| Build published output | `npm run build` |
| Lint | `npm run lint` |
| Check formatting | `npm run format:check` |
| Typecheck including specs | `npm run typecheck` |
| Offline tests | `touch .env && npm run jest -- --runInBand --testPathIgnorePatterns='llm-tool.spec.ts\|llm-schema-v3.spec.ts\|node_modules\|dist'` |
| Full tests with provider credentials | `touch .env && npm test` |
| Agent infrastructure | `bash scripts/agent-check.sh` |
| Verify a change | Follow `.agents/skills/verify-schema-forge/SKILL.md` |

The test wrapper reads `.env` through env-cmd, even for offline tests. An empty
file suffices for offline runs. The two excluded suites instantiate provider
clients at module load and make real network calls. They need OPENAI_API_KEY,
ANTHROPIC_API_KEY and GEMINI_API_KEY; they can incur costs. All other specs run
offline, including README compilation and provider-shape assertions.
Prettier scripts cover source TypeScript only, not Markdown or JSON.

## Rules

- Always target feature PRs at `develop`. Release PRs merge `develop` into `main`;
  the release merge history follows that route. A push to `main` or manual run of
  `.github/workflows/cd.yml` publishes to npm and GitHub Packages if the version is new.
  Enforced by: review; publishing trigger in `.github/workflows/cd.yml`.
- Always expose public additions through `src/lib/index.ts` and check both named
  exports and the `Schema` compatibility namespace when changing an existing API.
  The package entry is built from that file.
  Enforced by: review; package exports in `package.json`.
- Never mutate caller options, inherited metadata or prior generation results.
  Recent fixes isolate updates and array items so later calls cannot corrupt them.
  Enforced by: `src/lib/resolve.spec.ts` in CI.
- Always review snapshot diffs after `npm run jest:u -- --runInBand` with an
  explicit test path. Snapshot updates record output changes, not proof of correctness.
  Enforced by: review of `src/__snapshots__/schema-forge.spec.ts.snap`.
- Always describe consumer-visible changes in `CHANGELOG.md`; coordinate release
  version changes in `package.json` and `package-lock.json`. History pairs release
  notes with version bumps, not every maintenance commit with a new version.
  Enforced by: review.
- Never force-push, delete `main` or `develop`, or bypass hooks with `--no-verify`.
  Enforced by: `.claude/hooks/guard-bash.sh` for common Bash command forms in Claude Code.
- Always keep real skill files under `.agents/skills/` and matching relative
  symlinks under `.claude/skills/`. Never maintain two copies.
  Enforced by: `scripts/agent-check.sh` in CI.
- Always run lint, formatting, spec-inclusive typechecking, offline tests and build
  before reporting a library change complete. Provider changes also need relevant
  live suites when credentials are available; report them unverified otherwise.
  Enforced by: `.github/workflows/ci.yml` for lint, format, types, full tests and build.

`CLAUDE.md` loads this file; harness details belong there. Structural guidance
checks and hook self-tests run independently of provider credentials in CI.
