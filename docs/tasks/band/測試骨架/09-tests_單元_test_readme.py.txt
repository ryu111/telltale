"""票 09：plugin README 的 validate 區塊與當前輸出一字不差；LICENSE 是 MIT；CI 跑 bun 與 validate。

評測法：exact match。對題目 §6 第 3 條、SDD 切片層 #9。
"""

import json
import os
import re
import subprocess
from pathlib import Path

根 = Path(__file__).resolve().parents[2]
插件 = 根 / "plugins/telltale"


def _validate_notes() -> list[str]:
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


def test_readme_提到的已知限制() -> None:
    readme = (插件 / "README.md").read_text(encoding="utf-8")
    for 關鍵 in (
        "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1",
        "/telltale",
        "~/.claude/plugins/store",
        "emoji",
    ):
        assert 關鍵 in readme, 關鍵


def test_license_是MIT() -> None:
    for d in (根, 插件):  # GitHub reads the root one; the plugin ships its own copy
        text = (d / "LICENSE").read_text(encoding="utf-8")
        assert "MIT License" in text and "ryu111" in text


def test_ci_跑bun與validate() -> None:
    ci = (根 / ".github/workflows/check.yml").read_text(encoding="utf-8")
    assert "setup-bun" in ci and "@anthropic-ai/claude-code" in ci and "make check" in ci
