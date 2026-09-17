#!/usr/bin/env python3
"""跑全部票：一個 feature 目錄下的票依編號與依賴順序全部跑完，攢成一份報告。長跑用。

    make tickets F=docs/tasks/<feature>

- 票檔 NN-<slug>.md 依 NN 排序；「依賴（Blocked by）」列的編號沒 merged 就跳過（記成 blocked）。
- 每張票交給 scripts/跑票.py；它 stopped 就記下站與理由，繼續跑不相依的票。
- 退出碼：0 全部 merged；3 有票 stopped／blocked（報告列出每張要人看的）；1 有 infra_error。
- 使用者只在兩個時間點出現：plan 核准前、這份報告出來後（2026-09-05 裁定）。
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from collections.abc import Callable, Sequence
from pathlib import Path
from typing import Any

執行器型 = Callable[[Sequence[str], Path | None], tuple[int, str, str]]


def 編號(票: Path) -> str:
    """NN-<slug>.md 的 NN；沒有就空字串。"""
    m = re.match(r"(\d+)-", 票.name)
    return m.group(1) if m else ""


def 依賴(票文字: str) -> list[str]:
    """「依賴（Blocked by）：01, 02」→ ["01","02"]；「無」→ []。"""
    for 行 in 票文字.splitlines():
        if "Blocked by" in 行 or "依賴" in 行:
            尾 = 行.split("：", 1)[-1].split(":", 1)[-1]
            return re.findall(r"\d+", 尾)
    return []


def 排序(目錄: Path) -> list[Path]:
    """只取 NN- 開頭的票，依 NN 排。"""
    return sorted(
        (p for p in 目錄.glob("*.md") if re.match(r"\d+-", p.name)), key=lambda p: int(編號(p))
    )


def 真的執行(argv: Sequence[str], cwd: Path | None) -> tuple[int, str, str]:
    """唯一碰 subprocess 的地方；測試換成假的。"""
    r = subprocess.run(list(argv), cwd=cwd, capture_output=True, text=True, check=False)  # noqa: S603
    return r.returncode, r.stdout, r.stderr


def 最後一行json(文字: str) -> dict[str, Any]:
    """跑票.py 的 stdout 最後一行是 JSON 報告。"""
    for 行 in reversed(文字.strip().splitlines()):
        try:
            d = json.loads(行)
        except ValueError:
            continue
        if isinstance(d, dict):
            return d
    return {}


def 跑全部(目錄: Path, 根: Path, 執行: 執行器型, 跑票argv: Sequence[str]) -> dict[str, Any]:
    """依序跑；回 {tickets:[{ticket,result,station,reason}], merged, stopped, blocked, infra}。"""
    merged: set[str] = set()
    出: list[dict[str, Any]] = []
    for 票 in 排序(目錄):
        缺 = [d for d in 依賴(票.read_text(encoding="utf-8")) if d not in merged]
        if 缺:
            出.append(
                {
                    "ticket": str(票),
                    "result": "blocked",
                    "reason": f"依賴 {'、'.join(缺)} 沒 merged",
                }
            )
            continue
        rc, out, err = 執行([*跑票argv, str(票)], 根)
        r = 最後一行json(out)
        r.setdefault("result", "infra_error")
        r.setdefault("reason", err.strip()[-300:])
        出.append({"ticket": str(票), **{k: r.get(k) for k in ("result", "station", "reason")}})
        if r.get("result") == "merged":
            merged.add(編號(票))

    def n(k: str) -> int:
        return sum(1 for x in 出 if x["result"] == k)

    return {
        "tickets": 出,
        "merged": n("merged"),
        "stopped": n("stopped"),
        "blocked": n("blocked"),
        "infra": n("infra_error"),
    }


def main(argv: list[str] | None = None) -> int:
    """入口：印報告、換退出碼。"""
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument("目錄")
    p.add_argument("--pr", action="store_true")
    a = p.parse_args(argv)
    跑票 = ["uv", "run", "python", "scripts/跑票.py", *(["--pr"] if a.pr else [])]
    報 = 跑全部(Path(a.目錄), Path.cwd(), 真的執行, 跑票)
    sys.stdout.write(json.dumps(報, ensure_ascii=False) + "\n")
    要人看 = [t for t in 報["tickets"] if t["result"] != "merged"]
    for t in 要人看:
        名 = Path(t["ticket"]).name
        sys.stderr.write(
            f"[要人看] {名}：{t['result']}／{t.get('station') or ''}／{t.get('reason')}\n"
        )
    if 報["infra"]:
        return 1
    return 3 if 要人看 else 0


if __name__ == "__main__":
    sys.exit(main())
