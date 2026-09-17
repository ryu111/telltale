"""骨架不是文件，是測試：文件不會 fail，這支會。"""

import re
from pathlib import Path

根 = Path(__file__).resolve().parents[2]


def test_套件住在src底下_根目錄沒有同名套件() -> None:
    assert (根 / "src" / "專案" / "__init__.py").exists()
    assert not (根 / "專案").exists()


def test_三層測試目錄都在() -> None:
    for 層 in ("單元", "流程", "評測"):
        assert (根 / "tests" / 層).is_dir(), 層


def test_設定只住pyproject() -> None:
    for 散落 in ("pytest.ini", "setup.py", "setup.cfg", "tox.ini", ".ruff.toml", "mypy.ini"):
        assert not (根 / 散落).exists(), 散落


def test_單元與流程層不碰真模型() -> None:
    真模型的import = re.compile(r"^\s*(import|from)\s+(anthropic|openai)\b", re.MULTILINE)
    for 層 in ("單元", "流程"):
        for 檔 in (根 / "tests" / 層).rglob("*.py"):
            if 檔 == Path(__file__):
                continue  # 這支自己就寫著那兩個名字
            assert not 真模型的import.search(檔.read_text(encoding="utf-8")), 檔


def test_機密不進版控() -> None:
    忽略 = (根 / ".gitignore").read_text(encoding="utf-8")
    for 樣式 in (".env", "*.key", "secrets/"):
        assert 樣式 in 忽略, 樣式
