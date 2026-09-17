"""量一份 tmux capture 裡帶子每一列的顯示寬度（東亞寬字算 2）。

    uv run python scripts/量寬度.py <capture.txt> <columns>

印一行：`w=<columns> rows=<N> widest=<W> content=<有無面板內容> ok|FAIL`；FAIL 退出碼 1。
帶子 = 從 `telltale` 開頭那列起，到狀態列（`updated`／`not shown`／`too large`）為止；
單列降級（`telltale · N panels`、`all panels off`）就只有那一列。
"""

import sys
import unicodedata
from pathlib import Path

MIN_COLUMNS = 20  # 與 hooks/layout.ts 同值；窄於它只剩一列，不要求面板內容


def 寬(s: str) -> int:
    """東亞寬字（W／F）算 2，控制字元 0，其餘 1。"""
    w = 0
    for ch in s:
        if unicodedata.category(ch)[0] == "C":
            continue
        w += 2 if unicodedata.east_asian_width(ch) in ("W", "F") else 1
    return w


def 帶子(lines: list[str]) -> list[str]:
    """抓出帶子那幾列（去掉引擎的 `[-]` 收合記號與尾端空白）。"""
    start = next((i for i, row in enumerate(lines) if row.startswith("telltale")), None)
    if start is None:
        return []
    首 = lines[start].replace("[-]", "").rstrip()
    # Single-line band (all off, or narrower than MIN_COLUMNS): no `─ label ─` row follows.
    if start + 1 >= len(lines) or not lines[start + 1].startswith("─ "):
        return [首]
    out = [首]
    for row in lines[start + 1 :]:
        out.append(row.rstrip())
        if row.startswith(("updated", "⋯")) or "too large" in row:
            break
    return out


def main() -> int:
    """入口。"""
    capture, columns = Path(sys.argv[1]), int(sys.argv[2])
    rows = 帶子(capture.read_text(encoding="utf-8").splitlines())
    if not rows:
        print(f"w={columns} rows=0 FAIL (band not found)")  # noqa: T201
        return 1
    widest = max(寬(r) for r in rows)
    content = any(r.startswith("─") for r in rows)
    ok = widest <= columns and (content or columns < MIN_COLUMNS)
    狀態 = "ok" if ok else "FAIL"
    print(f"w={columns} rows={len(rows)} widest={widest} content={content} {狀態}")  # noqa: T201
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
