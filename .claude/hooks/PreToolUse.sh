#!/bin/sh
# PreToolUse（Edit|Write）：只列要叫誰，不放邏輯。邏輯住在 .claude/hooks/scripts/。
INPUT=$(cat)
S="$(dirname "$0")/scripts"
printf '%s' "$INPUT" | /usr/bin/python3 "$S/範圍.py" || exit $?
exit 0
