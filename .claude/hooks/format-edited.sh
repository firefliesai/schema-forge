#!/usr/bin/env bash
set -u
root=${CLAUDE_PROJECT_DIR:-}
[ -d "$root" ] || exit 0
node -e '
const fs = require("node:fs"), path = require("node:path"), cp = require("node:child_process");
try {
  const input = JSON.parse(fs.readFileSync(0, "utf8"));
  if (!input.tool_input?.file_path) process.exit(0);
  const root = fs.realpathSync(process.argv[1]);
  const file = fs.realpathSync(path.resolve(root, input.tool_input.file_path));
  const rel = path.relative(root, file);
  if (!rel.startsWith("src" + path.sep) || !rel.endsWith(".ts")) process.exit(0);
  const prettier = path.join(root, "node_modules/.bin/prettier");
  cp.execFileSync(prettier, ["--write", "--log-level", "silent", "--", file], {cwd: root, stdio: "ignore", timeout: 15000});
} catch {}
' "$root" || true
