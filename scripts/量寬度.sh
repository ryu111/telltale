#!/bin/sh
# Ticket 08 / DoD #4: resize the tmux session step by step and measure every band row.
# Usage: scripts/量寬度.sh [session=tt]   (the session must already be running the plugin)
# Prints one line per width: width, band rows, widest row, ok/FAIL. Exit 1 on any FAIL.
S=${1:-tt}
OUT=${OUT:-/tmp/telltale-width}
mkdir -p "$OUT"
rc=0
for w in 200 150 110 80 60 45 30 15; do
  tmux resize-window -t "$S" -x "$w" -y 34
  sleep 4
  tmux capture-pane -t "$S" -p > "$OUT/$w.txt"
  # The band = the row starting with "telltale" up to and including the status row
  # ("updated …" / "⋯ … not shown" / "… data too large"); a single-line band has no status row.
  line=$(uv run --quiet python scripts/量寬度.py "$OUT/$w.txt" "$w") || rc=1
  printf '%s\n' "$line"
done
exit $rc
