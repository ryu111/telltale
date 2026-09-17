"""票 18：README v0.2（validate 區塊、agents 面板說明、TELLTALE_DEV、已知限制）；
寬度腳本重跑留痕；CI 不倒退。

評測法：exact match。對 SDD 切片層 #18、§0.1、§2.5、§2.6、§2.7。
"""

import os
import re
import subprocess
from pathlib import Path

根 = Path(__file__).resolve().parents[2]
插件 = 根 / "plugins/telltale"


def _validate_notes() -> list[str]:
    import json

    r = subprocess.run(
        ["claude", "plugin", "validate", "--strict", "--json", str(插件)],
        capture_output=True,
        text=True,
        check=False,
        env={**os.environ, "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1"},
    )
    報告 = json.loads(r.stdout)
    return [n for c in 報告["contents"] if c["type"] == "hooks" for n in c["notes"]]


def test_readme_的validate區塊與當前輸出一致() -> None:
    readme = (插件 / "README.md").read_text(encoding="utf-8")
    m = re.search(r"## What this plugin can touch.*?```text\n(.*?)```", readme, re.DOTALL)
    assert m, "README 缺 `## What this plugin can touch` 底下的 ```text 區塊"
    貼的 = [行.strip() for 行 in m.group(1).strip().splitlines()]
    真的 = [n.strip() for n in _validate_notes() if " hooks: " in n or " calls: " in n]
    assert 貼的 == 真的, f"README 過時：\n{貼的}\n≠\n{真的}"


def test_readme_提到agents面板與TELLTALE_DEV() -> None:
    readme = (插件 / "README.md").read_text(encoding="utf-8")
    for 關鍵 in (
        "TELLTALE_DEV",
        "agents style",
        "agents edge",
        "agents clear",
        "Pane",
        "subagent",
        "orphan",
        "background command",
    ):
        assert 關鍵.lower() in readme.lower(), 關鍵


def test_readme_agents_edge表有not_available那一行() -> None:
    readme = (插件 / "README.md").read_text(encoding="utf-8")
    assert "not available in this build" in readme


def test_readme_舊有已知限制沒被砍掉() -> None:
    # v0.1 的段落（票 09）不因為 v0.2 改寫而消失。
    readme = (插件 / "README.md").read_text(encoding="utf-8")
    for 關鍵 in (
        "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1",
        "/telltale",
        "~/.claude/plugins/store",
        "emoji",
    ):
        assert 關鍵 in readme, 關鍵


def test_license_是MIT() -> None:
    for d in (根, 插件):
        text = (d / "LICENSE").read_text(encoding="utf-8")
        assert "MIT License" in text and "ryu111" in text


def test_ci_跑bun與validate() -> None:
    ci = (根 / ".github/workflows/check.yml").read_text(encoding="utf-8")
    assert "setup-bun" in ci and "@anthropic-ai/claude-code" in ci and "make check" in ci


def test_寬度實測有v02這一輪的紀錄() -> None:
    寬度檔 = 根 / "docs/實測/寬度.md"
    assert 寬度檔.exists(), "docs/實測/寬度.md 不存在（票 08 應該已建立）"
    內容 = 寬度檔.read_text(encoding="utf-8")
    assert re.search(r"v0\.2|2026-09-1[7-9]|2026-09-2\d", 內容), (
        "docs/實測/寬度.md 沒有本輪（v0.2，agents 面板開著）重跑的紀錄，"
        "只有票 08 的舊結果不算數——agents 面板改變了畫面內容，寬度腳本要重跑一次"
    )
