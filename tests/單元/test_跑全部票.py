"""跑全部票 的題目：順序、依賴、停了繼續、報告。假執行器，不開任何程序。"""

import json
import sys
from collections.abc import Sequence
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import 跑全部票  # noqa: E402


def _票(目錄: Path, 名: str, 依: str = "無") -> None:
    (目錄 / 名).write_text(
        f"# {名}\n- 可碰檔案：`src/x.py`\n- 驗收測試：`tests/流程/t.py`\n"
        f"- 依賴（Blocked by）：{依}\n",
        encoding="utf-8",
    )


class 假執行:
    def __init__(self, 劇本: dict[str, dict[str, object]]) -> None:
        self.劇本 = 劇本
        self.跑過: list[str] = []

    def __call__(self, argv: Sequence[str], cwd: Path | None) -> tuple[int, str, str]:
        del cwd
        名 = Path(argv[-1]).name
        self.跑過.append(名)
        r = self.劇本.get(名, {"result": "merged"})
        return 0, json.dumps(r, ensure_ascii=False), ""


def test_依賴解析() -> None:
    assert 跑全部票.依賴("- 依賴（Blocked by）：01, 02\n") == ["01", "02"]
    assert 跑全部票.依賴("- 依賴（Blocked by）：無\n") == []
    assert 跑全部票.依賴("沒這行") == []


def test_依編號順序跑_全merged(tmp_path: Path) -> None:
    for n in ("10-c.md", "02-b.md", "01-a.md"):
        _票(tmp_path, n)
    執 = 假執行({})
    報 = 跑全部票.跑全部(tmp_path, tmp_path, 執, ["跑票"])
    assert 執.跑過 == ["01-a.md", "02-b.md", "10-c.md"] and 報["merged"] == 3


def test_一張停了_依賴它的跳過_不相依的照跑(tmp_path: Path) -> None:
    _票(tmp_path, "01-a.md")
    _票(tmp_path, "02-b.md", "01")
    _票(tmp_path, "03-c.md")
    執 = 假執行({"01-a.md": {"result": "stopped", "station": "審查", "reason": "缺漏"}})
    報 = 跑全部票.跑全部(tmp_path, tmp_path, 執, ["跑票"])
    assert 執.跑過 == ["01-a.md", "03-c.md"]
    assert 報["stopped"] == 1 and 報["blocked"] == 1 and 報["merged"] == 1
    assert 報["tickets"][1]["result"] == "blocked" and "01" in 報["tickets"][1]["reason"]


def test_跑票沒印JSON算infra(tmp_path: Path) -> None:
    _票(tmp_path, "01-a.md")

    def 壞(argv: Sequence[str], cwd: Path | None) -> tuple[int, str, str]:
        del argv, cwd
        return 1, "", "Traceback…"

    報 = 跑全部票.跑全部(tmp_path, tmp_path, 壞, ["跑票"])
    assert 報["infra"] == 1 and "Traceback" in 報["tickets"][0]["reason"]
