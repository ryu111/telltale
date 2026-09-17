#!/bin/sh
# 改了 .py 就跑 ruff format + ruff check --fix + mypy。錯誤 exit 2 回給模型，它下一步會自己修。
INPUT=$(cat)
F=$(printf '%s' "$INPUT" | /usr/bin/python3 -c 'import sys,json;print(json.load(sys.stdin).get("tool_input",{}).get("file_path",""))' 2>/dev/null)
case "$F" in *.py) ;; *) exit 0 ;; esac
[ -f "$F" ] || exit 0
uv run ruff format --no-cache "$F" >/dev/null 2>&1
OUT=$(uv run ruff check --no-cache --fix "$F" 2>&1) || { printf 'ruff 紅了：\n%s\n' "$OUT" >&2; exit 2; }
OUT=$(uv run mypy --no-incremental "$F" 2>&1) || { printf 'mypy 紅了：\n%s\n' "$OUT" >&2; exit 2; }
exit 0
