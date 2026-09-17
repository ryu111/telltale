"""量寬度.py 的題目：三種帶子型態（裸／dock／inline）都要抓到，量到的寬度不能超欄。"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import 量寬度  # noqa: E402

# 三份 fixture 都是從 2026-09-18 票 18 重跑實測（docs/實測/寬度.md）的真實 tmux capture 節錄。

裸_200 = """telltale · 3 panels                                             [-]
─ agents ────────────────────────────────────────────────────────────
✓ main 23m51 · <task-notification>
<task-id>aa56f4d9082904ace</task-id>
<to
─ hello ─────────────────────────────────────────────────────────────
hello · 00:23:48
─ clock ─────────────────────────────────────────────────────────────
updated 0s ago
""".splitlines()

DOCK_110 = """ ▐▛███▛█   Claude Code v2.1.274                    │telltale · 3 panels    ✕
▝▜██████▀  Fable 5.1 with low effort · Claude Max  │─ agents ───────────────
  ▝▝ ▝▝    ~/projects/telltale/.worktrees/band-18  │✓ main 23m51 · 904ace</task-id>
                                                    │<to   ·
▎ Debug mode enabled · logging to /tmp/tt18.log    │─ hello ────────────────
                                                    │hello · 00:23:53
                                                    │updated 0s ago
""".splitlines()

INLINE_80 = """╭──────────────────────────────────────────────────────────────────────────────╮
│ telltale · 3 panels                                                        ✕ │
│ ─ agents ─────────────────────────────────────────────────────────────────── │
│ ✓ main 23m51 · <task-notification>                                           │
│ <task-id>aa56f4d9082904ace</task-id>                                         │
│ <to                                                                          │
│ ─ hello ──────────────────────────────────────────────────────────────────── │
│ hello · 00:23:58                                                             │
│ ─ clock ──────────────────────────────────────────────────────────────────── │
│ 00:24:00                                                                     │
╰──────────────────────────────────────────────────────────────────────────────╯
""".splitlines()


def test_裸型態() -> None:
    """欄 0 起算的裸帶子照舊抓到，帶內容。"""
    型態, rows = 量寬度.帶子(裸_200)
    assert 型態 == "裸"
    assert any("─ " in r for r in rows)


def test_dock型態() -> None:
    """寬終端 Pane 靠右 dock：帶子在某一欄後的 `│` 右側，不是裸列。"""
    型態, rows = 量寬度.帶子(DOCK_110)
    assert 型態 == "dock"
    assert any("─ " in r for r in rows)
    assert all("│" in r for r in rows)


def test_inline框型態() -> None:
    """窄終端 Pane 落到輸入框上方：整塊被 `╭─╮…╰─╯` 框住。"""
    型態, rows = 量寬度.帶子(INLINE_80)
    assert 型態 == "inline"
    assert rows[0].startswith("╭") and rows[-1].startswith("╰")
    assert any("─ " in r for r in rows)


def test_inline框每列不超欄且找到面板內容(tmp_path: Path) -> None:
    """對照票 18 實測：80 欄的 inline 框每列 ≤ 80，且有面板內容，回 ok。"""
    capture = tmp_path / "80.txt"
    capture.write_text("\n".join(INLINE_80), encoding="utf-8")
    型態, rows = 量寬度.帶子(INLINE_80)
    widest = max(量寬度.寬(r) for r in rows)
    assert 型態 == "inline"
    assert widest <= 80


def test_找不到任何型態回none() -> None:
    """三種偵測法都失敗時，回 none 與空列表（帶子 not found，不是誤判超寬）。"""
    型態, rows = 量寬度.帶子(["不相干的一行", "另一行"])
    assert 型態 == "none"
    assert rows == []


def test_裸型態_沒有狀態列就停在提示分隔線前() -> None:
    """票 23：沒 dropped／error 就沒有狀態列；帶子到分隔線（整列 ─）前為止，不把提示列算進去。"""
    lines = [
        "telltale · 1 panels                          [-]",
        "─ agents ────────────────────────────────────",
        "✓ main 8s · 數檔案",
        "────────────────────────────────────────────────",
        "❯ 用一個 Explore",
    ]
    型態, rows = 量寬度.帶子(lines)
    assert 型態 == "裸"
    assert len(rows) == 3
    assert not any(set(r.rstrip()) == {"─"} for r in rows)
