"""範圍 hook 是保證，不是提醒：用真的 stdin JSON 跑腳本，看退出碼。"""

import json
import subprocess
import sys
from pathlib import Path

import pytest

根 = Path(__file__).resolve().parents[2]
腳本 = 根 / ".claude" / "hooks" / "scripts" / "範圍.py"


def _跑(專案: Path, 目標: str) -> subprocess.CompletedProcess[str]:
    輸入 = json.dumps({"cwd": str(專案), "tool_input": {"file_path": str(專案 / 目標)}})
    return subprocess.run(
        [sys.executable, str(腳本)], input=輸入, text=True, capture_output=True, check=False
    )


@pytest.fixture
def 專案(tmp_path: Path) -> Path:
    (tmp_path / "docs" / "tasks").mkdir(parents=True)
    (tmp_path / "docs" / "tasks" / "01-票.md").write_text(
        "- 可碰檔案：`src/專案/迴圈.py`、`src/專案/工具/*.py`\n", encoding="utf-8"
    )
    return tmp_path


def _開票(專案: Path, 指向: str = "docs/tasks/01-票.md") -> None:
    (專案 / "docs" / "tasks" / "目前").write_text(指向 + "\n", encoding="utf-8")


def test_沒有指針就放行(專案: Path) -> None:
    assert _跑(專案, "tests/任何.py").returncode == 0


def test_清單內放行_glob也算(專案: Path) -> None:
    _開票(專案)
    assert _跑(專案, "src/專案/迴圈.py").returncode == 0
    assert _跑(專案, "src/專案/工具/查.py").returncode == 0


def test_清單外擋下_並說明只准動哪些(專案: Path) -> None:
    _開票(專案)
    結果 = _跑(專案, "tests/流程/test_迴圈.py")
    assert 結果.returncode == 2
    assert "src/專案/迴圈.py" in 結果.stderr


def test_前綴繞不過_整串比對(專案: Path) -> None:
    _開票(專案)
    assert _跑(專案, "mutants/src/專案/迴圈.py").returncode == 2


def test_指針指到不存在的票_大聲失敗不放行(專案: Path) -> None:
    _開票(專案, "docs/tasks/不存在.md")
    assert _跑(專案, "src/專案/迴圈.py").returncode == 2


def test_票沒有可碰檔案那行_大聲失敗(專案: Path) -> None:
    (專案 / "docs" / "tasks" / "01-票.md").write_text("# 空票\n", encoding="utf-8")
    _開票(專案)
    assert _跑(專案, "src/專案/迴圈.py").returncode == 2


def test_允許清掉指針本身(專案: Path) -> None:
    _開票(專案)
    assert _跑(專案, "docs/tasks/目前").returncode == 0
