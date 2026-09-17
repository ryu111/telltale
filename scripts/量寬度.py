"""量一份 tmux capture 裡帶子每一列的顯示寬度（東亞寬字算 2）。

    uv run python scripts/量寬度.py <capture.txt> <columns>

印一行：`w=<columns> rows=<N> widest=<W> content=<有無面板內容> 型態=<型態> ok|FAIL`；
FAIL 退出碼 1。
帶子有三種型態（2.1.274 起 Pane 會自適應，見 docs/實測/寬度.md）：
- 裸：從欄 0 的 `telltale` 開頭那列起，到狀態列（`updated`／`⋯`／`too large`）為止。
- dock：寬終端時 Pane 靠右 dock，帶子在某一欄之後的 `│` 右側，同一欄位往下延伸到狀態列。
- inline：窄終端時 Pane 落到輸入框上方，整塊被 `╭─╮`／`│…│`／`╰─╯` 框住，帶子＝整個框。
單列降級（`telltale · N panels`、`all panels off`）就只有那一列（僅裸型態會這樣）。
"""

import re
import sys
import unicodedata
from pathlib import Path

MIN_COLUMNS = 20  # 與 hooks/layout.ts 同值；窄於它只剩一列，不要求面板內容

_框頂底 = re.compile(r"^[╭╰][─]+[╮╯]$")


def 寬(s: str) -> int:
    """東亞寬字（W／F）算 2，控制字元 0，其餘 1。"""
    w = 0
    for ch in s:
        if unicodedata.category(ch)[0] == "C":
            continue
        w += 2 if unicodedata.east_asian_width(ch) in ("W", "F") else 1
    return w


def _裸帶子(lines: list[str]) -> list[str] | None:
    """欄 0 起算、不帶前綴字元的裸帶子。"""
    start = next((i for i, row in enumerate(lines) if row.startswith("telltale")), None)
    if start is None:
        return None
    首 = lines[start].replace("[-]", "").rstrip()
    if start + 1 >= len(lines) or not lines[start + 1].startswith("─ "):
        return [首]
    out = [首]
    for row in lines[start + 1 :]:
        # Ticket 23: the status row only exists when something was dropped or errored;
        # otherwise the band ends right before the prompt separator (a full row of ─) or the prompt.
        if _是提示分隔線(row) or row.startswith("❯"):
            break
        out.append(row.rstrip())
        if row.startswith("⋯") or "too large" in row:
            break
    return out


def _是提示分隔線(row: str) -> bool:
    """整列只有 `─`（至少 10 格）＝輸入框上方的分隔線，不是帶子的。"""
    s = row.rstrip()
    return len(s) >= 分隔線最短 and set(s) == {"─"}


分隔線最短 = 10


def _inline框帶子(lines: list[str]) -> list[str] | None:
    """窄終端：Pane 落到輸入框上方，整塊被 `╭─╮…╰─╯` 框住。"""
    start = next((i for i, row in enumerate(lines) if _框頂底.match(row.rstrip())), None)
    if start is None:
        return None
    end = next(
        (i for i in range(start + 1, len(lines)) if _框頂底.match(lines[i].rstrip())),
        None,
    )
    if end is None:
        return None
    frame = [row.rstrip() for row in lines[start : end + 1]]
    if not any("telltale" in row for row in frame):
        return None
    return frame


def _dock帶子(lines: list[str]) -> list[str] | None:
    """寬終端：Pane 靠右 dock，帶子在某一欄之後的 `│` 右側往下延伸。"""
    start = next((i for i, row in enumerate(lines) if "│telltale" in row), None)
    if start is None:
        return None
    col = lines[start].index("│telltale")
    out = []
    for row in lines[start:]:
        if len(row) <= col or row[col] != "│":
            break
        out.append(row.rstrip())
        if row.startswith(("updated", "⋯"), col + 1) or "too large" in row:
            break
    return out or None


def 帶子(lines: list[str]) -> tuple[str, list[str]]:
    """抓出帶子那幾列與型態；三種偵測法依序試，第一個成功的算。"""
    for 型態, 找 in (("裸", _裸帶子), ("inline", _inline框帶子), ("dock", _dock帶子)):
        rows = 找(lines)
        if rows is not None:
            return 型態, rows
    return "none", []


def main() -> int:
    """入口。"""
    capture, columns = Path(sys.argv[1]), int(sys.argv[2])
    型態, rows = 帶子(capture.read_text(encoding="utf-8").splitlines())
    if not rows:
        print(f"w={columns} rows=0 FAIL (band not found)")  # noqa: T201
        return 1
    widest = max(寬(r) for r in rows)
    content = any("─ " in r for r in rows)
    ok = widest <= columns and (content or columns < MIN_COLUMNS)
    狀態 = "ok" if ok else "FAIL"
    print(  # noqa: T201
        f"w={columns} rows={len(rows)} widest={widest} content={content} 型態={型態} {狀態}"
    )
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
