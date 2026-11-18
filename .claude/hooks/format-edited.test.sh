#!/usr/bin/env bash
set -eu
root=$(cd "$(dirname "$0")/../.." && pwd)
hook="$root/.claude/hooks/format-edited.sh"
fixture=$(mktemp -d)
trap 'rm -rf "$fixture"' EXIT
mkdir -p "$fixture/src" "$fixture/node_modules/.bin" "$fixture/outside"
ln -s "$root/node_modules/.bin/prettier" "$fixture/node_modules/.bin/prettier"
printf 'const x={a:1}\n' > "$fixture/src/example.ts"
printf 'const x={a:1}\n' > "$fixture/outside/example.ts"
run() {
  node -e 'console.log(JSON.stringify({tool_input:{file_path:process.argv[1]}}))' "$1" | CLAUDE_PROJECT_DIR="$fixture" bash "$hook"
}
run "$fixture/src/example.ts"
test "$(cat "$fixture/src/example.ts")" = 'const x = { a: 1 };'
run "$fixture/outside/example.ts"
test "$(cat "$fixture/outside/example.ts")" = 'const x={a:1}'
ln -s "$fixture/outside/example.ts" "$fixture/src/link.ts"
run "$fixture/src/link.ts"
test "$(cat "$fixture/outside/example.ts")" = 'const x={a:1}'
printf '{}\n' | CLAUDE_PROJECT_DIR="$fixture" bash "$hook"
printf 'invalid json' | CLAUDE_PROJECT_DIR="$fixture" bash "$hook"
run "$fixture/src/missing.ts"
printf 'invalid {{{' > "$fixture/src/broken.ts"
run "$fixture/src/broken.ts"
rm "$fixture/node_modules/.bin/prettier"
run "$fixture/src/example.ts"
echo 'format-edited self-test passed'
