#!/usr/bin/env bash
set -eu
cd "$(dirname "$0")/.."
node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
assert.equal(fs.readFileSync('CLAUDE.md', 'utf8').split('\n')[0], '@AGENTS.md');
for (const name of fs.readdirSync('.agents/skills')) {
  assert.ok(fs.statSync(`.agents/skills/${name}`).isDirectory(), `Not a skill directory: ${name}`);
  assert.ok(fs.statSync(`.agents/skills/${name}/SKILL.md`).isFile(), `Missing SKILL.md: ${name}`);
  const twin = `.claude/skills/${name}`;
  assert.ok(fs.lstatSync(twin).isSymbolicLink(), `Not a symlink: ${twin}`);
  assert.equal(fs.readlinkSync(twin), `../../.agents/skills/${name}`, `Wrong skill target: ${twin}`);
  assert.ok(fs.existsSync(twin), `Broken skill symlink: ${twin}`);
}
for (const name of fs.readdirSync('.claude/skills')) {
  assert.ok(fs.existsSync(`.agents/skills/${name}/SKILL.md`), `Orphaned Claude skill: ${name}`);
}
const docs = dir => fs.readdirSync(dir, {withFileTypes: true}).flatMap(e =>
  e.isDirectory() ? docs(path.join(dir, e.name)) : e.name.endsWith('.md') ? [path.join(dir, e.name)] : []);
for (const file of ['AGENTS.md', 'CLAUDE.md', 'REVIEW.md', ...docs('docs')]) {
  const text = fs.readFileSync(file, 'utf8');
  const cited = [...text.matchAll(/`([^`\n]+)`/g)].map(m => m[1]);
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0];
    if (target && !/^[a-z]+:/i.test(target)) {
      assert.ok(fs.existsSync(path.resolve(path.dirname(file), target)), `${file}: missing link ${target}`);
    }
  }
  for (let target of cited) {
    if (!/^(?:(?:[\w.-]+\/)+[\w.-]*|[\w.-]+\.(?:md|json|ts|yml|sh))$/.test(target)) continue;
    target = target.replace(/\/$/, '');
    assert.ok(fs.existsSync(target), `${file}: missing path ${target}`);
  }
}
console.log('Agent guidance paths and skill layout passed');
NODE
for test in .claude/hooks/*.test.sh; do bash "$test"; done
echo 'agent-check passed'
