#!/usr/bin/env python3
"""PreToolUse（Edit|Write）：實作只准動目前 task 的「可碰檔案」。

介面：
- 指針檔 docs/tasks/目前：一行，目前 task 檔的路徑（相對專案根）。沒有指針 = 不在 task 裡，放行。
- task 檔內一行「- 可碰檔案：`a.py`、`src/x/*.py`」，反引號裡每一段是一個 glob。
- 指針有、task 檔或那行找不到 → 大聲失敗（exit 2），不模糊放行。
"""

import json
import re
import sys
from fnmatch import fnmatchcase
from pathlib import Path

指針 = Path("docs/tasks/目前")


def _擋(訊息: str) -> None:
    """exit 2 把原因回給模型。"""
    sys.stderr.write(訊息 + "\n")
    sys.exit(2)


def 可碰清單(task檔: Path) -> list[str]:
    """讀「可碰檔案」那行反引號裡的 glob。"""
    for 行 in task檔.read_text(encoding="utf-8").splitlines():
        if "可碰檔案" in 行:
            清單 = re.findall(r"`([^`]+)`", 行)
            if 清單:
                return 清單
    _擋(f"{task檔} 沒有「可碰檔案：`...`」這一行，範圍 hook 無法判定。補上或刪掉 docs/tasks/目前。")
    return []


def 在範圍內(相對路徑: str, 清單: list[str]) -> bool:
    """任一 glob 整串命中即可；整串比對，`mutants/src/x.py` 不會被 `src/x.py` 放行。"""
    return any(fnmatchcase(相對路徑, 樣式) for 樣式 in 清單)


def main() -> None:
    """stdin 是 hook 的 JSON；沒指針放行，範圍外 exit 2。"""
    輸入 = json.load(sys.stdin)
    根 = Path(輸入.get("cwd") or ".").resolve()
    目標 = 輸入.get("tool_input", {}).get("file_path", "")
    if not 目標:
        return
    指針檔 = 根 / 指針
    if not 指針檔.is_file():
        return  # 不在 task 裡（出題、整理、寫文件）
    task路徑 = 指針檔.read_text(encoding="utf-8").strip()
    task檔 = 根 / task路徑
    if not task檔.is_file():
        _擋(f"docs/tasks/目前 指向 {task路徑}，但檔案不存在。")
    try:
        相對 = Path(目標).resolve().relative_to(根).as_posix()
    except ValueError:
        _擋(f"{目標} 在專案外，task 期間不准碰。")
        return
    if 相對 == 指針.as_posix():
        return  # 允許收尾時清掉指針
    清單 = 可碰清單(task檔)
    if not 在範圍內(相對, 清單):
        _擋(
            f"範圍外：{相對}\n目前 task {task路徑} 只准動：{'、'.join(清單)}\n"
            "要碰別的：回出題那格改 task 的可碰檔案，或先刪 docs/tasks/目前 結束這張票。"
        )


if __name__ == "__main__":
    main()
