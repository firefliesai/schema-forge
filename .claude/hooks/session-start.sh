#!/usr/bin/env bash
set -eu
cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"
[ -f package.json ] || exit 0
[ -z "${CI:-}" ] || exit 0
if [ ! -e node_modules ] && [ ! -L node_modules ]; then
  if [ "${CLAUDE_CODE_REMOTE:-}" = true ]; then
    if ! npm ci; then
      echo 'Dependencies NOT ready: npm ci failed.' >&2
      exit 1
    fi
  else
    echo 'Dependencies missing. Run npm ci.'
  fi
fi
echo 'Verify with .agents/skills/verify-schema-forge/SKILL.md (offline first).'
