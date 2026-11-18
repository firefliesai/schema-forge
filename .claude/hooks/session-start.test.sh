#!/usr/bin/env bash
set -eu
hook=$(cd "$(dirname "$0")" && pwd)/session-start.sh
fixture=$(mktemp -d)
trap 'rm -rf "$fixture"' EXIT
mkdir -p "$fixture/bin" "$fixture/project"
printf '{}\n' > "$fixture/project/package.json"
printf '#!/bin/sh\nprintf "%%s" "$*" > "$NPM_CALL"\nexit "${NPM_EXIT:-0}"\n' > "$fixture/bin/npm"
chmod +x "$fixture/bin/npm"
export PATH="$fixture/bin:$PATH" CLAUDE_PROJECT_DIR="$fixture/project" NPM_CALL="$fixture/call" CI=
CLAUDE_CODE_REMOTE=false bash "$hook" > "$fixture/out"
test ! -e "$NPM_CALL"
node -e 'if (!require("fs").readFileSync(process.argv[1], "utf8").includes("Dependencies missing")) process.exit(1)' "$fixture/out"
CLAUDE_CODE_REMOTE=true bash "$hook" > /dev/null
test "$(cat "$NPM_CALL")" = ci
rm "$NPM_CALL"
mkdir "$fixture/project/node_modules"
CLAUDE_CODE_REMOTE=true bash "$hook" > /dev/null
test ! -e "$NPM_CALL"
rmdir "$fixture/project/node_modules"
CI=true CLAUDE_CODE_REMOTE=true bash "$hook"
test ! -e "$NPM_CALL"
if NPM_EXIT=1 CLAUDE_CODE_REMOTE=true bash "$hook" > "$fixture/out" 2>&1; then exit 1; fi
node -e 'if (!require("fs").readFileSync(process.argv[1], "utf8").includes("NOT ready")) process.exit(1)' "$fixture/out"
rm "$NPM_CALL"
ln -s "$fixture/missing" "$fixture/project/node_modules"
CLAUDE_CODE_REMOTE=true bash "$hook" > /dev/null
test ! -e "$NPM_CALL"
echo 'session-start self-test passed'
