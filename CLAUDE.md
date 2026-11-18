@AGENTS.md

## Claude Code hooks

`.claude/settings.json` registers three command hooks.

- SessionStart runs `.claude/hooks/session-start.sh`. It installs missing dependencies
  only when CLAUDE_CODE_REMOTE=true, skips CI and existing installs, and reports failures.
- PreToolUse for Bash runs `.claude/hooks/guard-bash.sh`. It inspects command text,
  not arbitrary shell programs; it is a safety net, not a security sandbox.
- PostToolUse for Edit, Write and MultiEdit runs `.claude/hooks/format-edited.sh`.
  It formats existing source TypeScript files with the installed Prettier and never
  blocks an edit. MultiEdit payloads without file_path are ignored.

Each hook has a neighboring shell self-test, run by `scripts/agent-check.sh`.
