#!/bin/sh
# PostToolUse：只列要叫誰，不放邏輯。邏輯住在 .claude/hooks/scripts/。
INPUT=$(cat)
S="$(dirname "$0")/scripts"
for f in 格式與型別.sh; do
  printf '%s' "$INPUT" | "$S/$f" || exit $?
done
exit 0
