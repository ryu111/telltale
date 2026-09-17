#!/usr/bin/env python3
"""讀 mutmut export-cicd-stats 的 JSON，分數低於門檻就 exit 1。

用法：python3 scripts/mutation門檻.py <門檻百分比>
分數 = killed / (total - skipped - no_tests)。找不到檔案就大聲失敗，不回 0。
"""

import json
import sys
from pathlib import Path

統計檔 = Path("mutants/mutmut-cicd-stats.json")
參數數 = 2


def main() -> None:
    """算分、印分、低於門檻 exit 1。"""
    if len(sys.argv) != 參數數:
        sys.exit("用法：mutation門檻.py <門檻百分比>")
    門檻 = float(sys.argv[1])
    if not 統計檔.is_file():
        sys.exit(f"找不到 {統計檔}，先跑 mutmut run && mutmut export-cicd-stats")
    s = json.loads(統計檔.read_text(encoding="utf-8"))
    分母 = s["total"] - s.get("skipped", 0) - s.get("no_tests", 0)
    if 分母 <= 0:
        sys.exit("沒有任何 mutant 被測到，分數無意義")
    分數 = 100 * s["killed"] / 分母
    sys.stdout.write(
        f"mutation score {分數:.1f}%（killed {s['killed']} / {分母}，門檻 {門檻:g}%）\n"
    )
    if 分數 < 門檻:
        sys.exit(1)


if __name__ == "__main__":
    main()
