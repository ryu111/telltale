#!/usr/bin/env python3
"""突變：對「這個行為很重要」的每一行，故意改壞、跑 bun test、要求它轉紅、改回來。

    make mutate            # 讀 hooks/mutations.json，全部跑
    uv run python scripts/突變.py --只 layout   # 只跑 label 含 "layout" 的

清單格式（hooks/mutations.json，每張票 append 自己那幾條）：
    [{"label": "砍掉的面板不講出來", "file": "hooks/layout.ts",
      "old": "dropped.push(id)", "new": "void id"}]

規矩（題目 §5.2）：
- `old` 在檔案裡必須恰好出現一次；0 次或多次都是清單壞了，退出碼 2，不猜。
- 突變後 `bun test hooks/` 必須非 0；全綠 = 那條承諾沒有測試守，退出碼 1，印出哪幾條。
- 不管結果如何一定把檔案改回去；改回去失敗退出碼 1 並大聲說。
- 清單為空：印 `0 mutations declared`，退出碼 0（骨架期允許；每張票的驗收條件要它非空）。
- 基準（沒突變）先跑一次要綠，否則突變結果沒意義，退出碼 2。
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path

執行器型 = Callable[[Sequence[str], Path], int]
_清單壞 = 2
_有人沒守 = 1


@dataclass(frozen=True)
class 突變:
    label: str
    file: str
    old: str
    new: str


def 讀清單(路徑: Path) -> list[突變]:
    """一個 .json 檔，或一個目錄（裡面每個 .json 依檔名排序串起來：一票一檔，並行不撞）。

    沒有檔 = 空清單；有檔但欄位缺 = 清單壞，直接 KeyError 出去。
    """
    if 路徑.is_dir():
        return [m for f in sorted(路徑.glob("*.json")) for m in 讀清單(f)]
    if not 路徑.is_file():
        return []
    return [
        突變(x["label"], x["file"], x["old"], x["new"]) for x in json.loads(路徑.read_text("utf-8"))
    ]


def 真的跑測試(argv: Sequence[str], cwd: Path) -> int:
    """唯一碰 subprocess 的地方；測試換成假的。"""
    return subprocess.run(list(argv), cwd=cwd, capture_output=True, check=False).returncode  # noqa: S603


def 套用一條(根: Path, m: 突變, 跑: 執行器型) -> bool | None:
    """回 True = 轉紅（有人守）；False = 全綠（沒人守）；None = 清單壞（old 不是恰好一次）。"""
    檔 = 根 / m.file
    原文 = 檔.read_text("utf-8")
    if 原文.count(m.old) != 1:
        return None
    檔.write_text(原文.replace(m.old, m.new, 1), "utf-8")
    try:
        rc = 跑(["bun", "test", "hooks/"], 根)
    finally:
        檔.write_text(原文, "utf-8")
    return rc != 0


def 跑全部(根: Path, 清單: Sequence[突變], 跑: 執行器型, 印: Callable[[str], None]) -> int:
    """逐條套用、印表、回退出碼。"""
    if not 清單:
        印("0 mutations declared")
        return 0
    if 跑(["bun", "test", "hooks/"], 根) != 0:
        印("baseline is red: mutation results would be meaningless")
        return _清單壞
    沒守: list[str] = []
    壞: list[str] = []
    for m in 清單:
        r = 套用一條(根, m, 跑)
        if r is None:
            壞.append(m.label)
            印(f"BAD   {m.label}: `{m.old}` not found exactly once in {m.file}")
        elif r:
            印(f"RED   {m.label}")
        else:
            沒守.append(m.label)
            印(f"GREEN {m.label}  ← no test guards this")
    印(f"{len(清單) - len(沒守) - len(壞)} red / {len(沒守)} green / {len(壞)} bad of {len(清單)}")
    if 壞:
        return _清單壞
    return _有人沒守 if 沒守 else 0


def main(argv: list[str] | None = None) -> int:
    """入口。"""
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument("--清單", default="hooks/mutations")
    p.add_argument("--只", default="", help="只跑 label 含這個字串的")
    a = p.parse_args(argv)
    根 = Path.cwd()
    清單 = [m for m in 讀清單(根 / a.清單) if a.只 in m.label]
    return 跑全部(根, 清單, 真的跑測試, print)  # noqa: T201


if __name__ == "__main__":
    sys.exit(main())
