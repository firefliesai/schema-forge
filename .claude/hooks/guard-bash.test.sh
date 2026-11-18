#!/usr/bin/env bash
set -eu
hook=$(cd "$(dirname "$0")" && pwd)/guard-bash.sh
check() {
  local expected=$1 command=$2 result=0
  printf '%s' "$command" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify({tool_input:{command:s}})))' | bash "$hook" >/dev/null 2>&1 || result=$?
  test "$result" = "$expected" || { echo "Unexpected guard result $result: $command"; exit 1; }
}
check 0 ''
check 0 'git status'
check 0 'git push origin HEAD'
check 0 'git branch -d feature/example'
check 0 'git push origin --delete feature/example'
check 2 'git push --force origin feature/example'
check 2 'git push origin feature/example --force-with-lease'
check 2 'git -C /repo push -f origin HEAD'
check 2 'git push origin +HEAD:feature/example'
check 2 'git branch -D main'
check 2 'git branch --delete develop'
check 2 'git push origin --delete main'
check 2 'git push origin --delete=develop'
check 2 'git push origin :refs/heads/develop'
check 2 'git commit --no-verify -m change'
check 2 'git status && git push -f origin HEAD'
if printf 'not json' | bash "$hook" >/dev/null 2>&1; then exit 1; fi
echo 'guard-bash self-test passed'
