"""票 01：plugin 骨架通過 `claude plugin validate --strict`，且 calls 只在白名單內。

評測法：exact match（validate 的 JSON 報告）。對 SDD §5 I1（子集版；恰好七個由票 05 的 TS 測試守）。
"""

import json
import os
import subprocess
from pathlib import Path

根 = Path(__file__).resolve().parents[2]
插件 = 根 / "plugins/telltale"
白名單 = {
    "$.ui.resolve",
    "$.ui.invalidate",
    "$.clock.now",
    "$.clock.every",
    "$.store.get",
    "$.store.set",
    "$.command.register",
    "$.agent.list",
    "$.session.id",
    "$.store.keys",
    "$.store.delete",
    "$.env.get",
    "$.ui.open",
    "$.ui.close (via applyEdge)",
}


def _validate() -> tuple[int, dict]:  # type: ignore[type-arg]
    r = subprocess.run(
        ["claude", "plugin", "validate", "--strict", "--json", str(插件)],
        capture_output=True,
        text=True,
        check=False,
        env={**os.environ, "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1"},
    )
    return r.returncode, json.loads(r.stdout)


def _notes() -> list[str]:
    _, 報告 = _validate()
    return [n for c in 報告.get("contents", []) if c.get("type") == "hooks" for n in c["notes"]]


def test_validate_strict_exit0() -> None:
    rc, 報告 = _validate()
    assert rc == 0 and 報告["success"], json.dumps(報告, ensure_ascii=False)[:800]


def test_hooks_註冊了AbovePrompt_的ui_render() -> None:
    assert any("ui.render{component=AbovePrompt}" in n for n in _notes()), _notes()


def test_calls_只在白名單內且非空() -> None:
    calls行 = [n for n in _notes() if " calls: " in n]
    assert calls行, _notes()
    宣告 = {x.strip() for n in calls行 for x in n.split("calls:", 1)[1].split(",")}
    assert 宣告 and 宣告 <= 白名單, 宣告 - 白名單


def test_不hook_tool_call_也不hook_classic() -> None:
    hooks行 = " ".join(n for n in _notes() if " hooks: " in n)
    assert "tool.call" not in hooks行 and "classic." not in hooks行, hooks行
