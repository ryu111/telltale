"""突變.py 的題目：假的 bun test。守「轉紅算守住、全綠算沒守、old 不唯一算清單壞、一定改回去」。"""

import json
import sys
from collections.abc import Sequence
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import 突變  # noqa: E402


class 假bun:
    """依檔案內容決定紅綠：內容含 `BROKEN` 就紅（rc 1）。記下每次看到的內容。"""

    def __init__(self, 根: Path, 檔: str) -> None:
        self.根 = 根
        self.檔 = 根 / 檔
        self.看到: list[str] = []

    def __call__(self, argv: Sequence[str], cwd: Path) -> int:
        assert list(argv) == ["bun", "test", 突變.測試目錄] and cwd == self.根
        內容 = self.檔.read_text("utf-8")
        self.看到.append(內容)
        return 1 if "BROKEN" in 內容 else 0


def _準備(tmp_path: Path, 內容: str, 清單: list[dict[str, str]]) -> tuple[Path, 假bun, list[str]]:
    (tmp_path / "hooks").mkdir()
    (tmp_path / "hooks/layout.ts").write_text(內容, "utf-8")
    (tmp_path / "hooks/mutations.json").write_text(json.dumps(清單), "utf-8")
    印出: list[str] = []
    return tmp_path, 假bun(tmp_path, "hooks/layout.ts"), 印出


def test_轉紅算守住_退出碼0_檔案改回去(tmp_path: Path) -> None:
    根, bun, 印 = _準備(
        tmp_path,
        "const a = min(x, MAX);\n",
        [{"label": "上限", "file": "hooks/layout.ts", "old": "min(x, MAX)", "new": "BROKEN"}],
    )
    rc = 突變.跑全部(根, 突變.讀清單(根 / "hooks/mutations.json"), bun, 印.append)
    assert rc == 0 and any(s.startswith("RED   上限") for s in 印)
    assert (根 / "hooks/layout.ts").read_text("utf-8") == "const a = min(x, MAX);\n"
    assert bun.看到 == ["const a = min(x, MAX);\n", "const a = BROKEN;\n"]  # 基準一次、突變一次


def test_全綠算沒守_退出碼1_點名(tmp_path: Path) -> None:
    根, bun, 印 = _準備(
        tmp_path,
        "dropped.push(id);\n",
        [
            {
                "label": "砍掉不講",
                "file": "hooks/layout.ts",
                "old": "dropped.push(id)",
                "new": "void id",
            }
        ],
    )
    rc = 突變.跑全部(根, 突變.讀清單(根 / "hooks/mutations.json"), bun, 印.append)
    assert rc == 1 and any(s.startswith("GREEN 砍掉不講") for s in 印)


def test_old不是恰好一次_清單壞_退出碼2_不動檔案(tmp_path: Path) -> None:
    根, bun, 印 = _準備(
        tmp_path,
        "x; x;\n",
        [{"label": "重複", "file": "hooks/layout.ts", "old": "x", "new": "BROKEN"}],
    )
    rc = 突變.跑全部(根, 突變.讀清單(根 / "hooks/mutations.json"), bun, 印.append)
    assert rc == 2 and any(s.startswith("BAD   重複") for s in 印)
    assert bun.看到 == ["x; x;\n"]  # 只有基準那次


def test_基準就紅_退出碼2_一條都不套(tmp_path: Path) -> None:
    根, bun, 印 = _準備(
        tmp_path,
        "BROKEN already\n",
        [{"label": "x", "file": "hooks/layout.ts", "old": "already", "new": "y"}],
    )
    rc = 突變.跑全部(根, 突變.讀清單(根 / "hooks/mutations.json"), bun, 印.append)
    assert rc == 2 and len(bun.看到) == 1


def test_清單為空_退出碼0_連基準都不跑(tmp_path: Path) -> None:
    根, bun, 印 = _準備(tmp_path, "whatever\n", [])
    assert 突變.跑全部(根, [], bun, 印.append) == 0
    assert 印 == ["0 mutations declared"] and bun.看到 == []


def test_沒有清單檔_視為空() -> None:
    assert 突變.讀清單(Path("/nonexistent/mutations.json")) == []


def test_目錄_一票一檔_依檔名串起來(tmp_path: Path) -> None:
    d = tmp_path / "hooks/mutations"
    d.mkdir(parents=True)
    (d / "03-b.json").write_text('[{"label":"b","file":"f","old":"o","new":"n"}]', "utf-8")
    (d / "02-a.json").write_text('[{"label":"a","file":"f","old":"o","new":"n"}]', "utf-8")
    assert [m.label for m in 突變.讀清單(d)] == ["a", "b"]
    assert 突變.讀清單(tmp_path / "hooks/nope") == []
