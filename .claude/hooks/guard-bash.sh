#!/usr/bin/env bash
# Text guard for common git invocations, not a shell parser or sandbox.
set -eu
node -e '
const fs = require("node:fs");
let command;
try { command = JSON.parse(fs.readFileSync(0, "utf8")).tool_input?.command; }
catch { console.error("Invalid Bash hook payload"); process.exit(2); }
if (typeof command !== "string") process.exit(0);
const segments = command.split(/[;&|\n]/);
for (const segment of segments) {
  const tokens = segment.replace(/["\x27]/g, "").trim().split(/\s+/);
  const git = tokens.indexOf("git");
  if (git < 0) continue;
  const args = tokens.slice(git + 1);
  const push = args.includes("push");
  const branch = args.includes("branch");
  const protectedName = t => /^(?:refs\/heads\/)?(?:main|develop)$/.test(t);
  const deny = args.some(t => /^--no-verify(?:=|$)/.test(t)) ||
    (push && args.some(t => /^--force(?:-with-lease|-if-includes)?(?:=|$)/.test(t) || /^-[^-]*f/.test(t) || t.startsWith("+"))) ||
    (branch && args.some(t => /^--delete(?:=|$)/.test(t) || /^-[^-]*[dD]/.test(t)) && args.some(protectedName)) ||
    ((branch || push) && args.some(t => /^--delete=(?:main|develop)$/.test(t))) ||
    (push && ((args.some(t => t === "--delete" || t === "-d") && args.some(protectedName)) || args.some(t => /^:(?:refs\/heads\/)?(?:main|develop)$/.test(t))));
  if (deny) { console.error("Blocked unsafe git command. See AGENTS.md."); process.exit(2); }
}
'
