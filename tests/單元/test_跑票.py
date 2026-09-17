"""跑票.py 的題目：假執行器，不開 git、不開 CLI。守的是「哪一站停、停的理由、發出去的指令」。"""

import json
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import 跑票  # noqa: E402

票 = """# 03-停止條件

- 可碰檔案：`src/專案/迴圈.py`
- 驗收測試：`tests/流程/test_迴圈.py`

## 題目
迴圈超過 8 步要停。
"""

禁止 = ("--no-verify", "--admin", "--force", "-f", "--hard")


class 假執行:
    """依 argv 回固定劇本；記下每一條指令。"""

    def __init__(self, 劇本: dict[str, Any]) -> None:
        self.劇本 = 劇本
        self.紀錄: list[list[str]] = []
        self.目錄紀錄: list[Path | None] = []
        self.實作次數 = 0
        self.審查次數 = 0
        self.已revert = False

    def __call__(self, argv: Sequence[str], cwd: Path | None) -> tuple[int, str, str]:
        a = list(argv)
        self.紀錄.append(a)
        self.目錄紀錄.append(cwd)
        if "跑" in a and "--票" in a:
            return self._委派(a)
        if "--untracked-files=all" in a and "core.quotePath=false" not in a:
            逸出 = '"src/\\345\\260\\210\\346\\241\\210/x.py"\n'  # 沒關 quotePath 就給你逸出的
            return 0, 逸出, ""
        if a[:2] == ["git", "-c"]:
            a = [a[0], *a[3:]]  # 去掉 -c core.quotePath=false 再比對
        if a[:2] == ["git", "clean"]:
            self.已revert = True
        if a[:2] == ["git", "status"] and self.已revert:
            return 0, "", ""
        if a[:3] == ["uv", "run", "pytest"] or a[:2] == ["bun", "test"]:
            return self._測試rc(cwd), "", ""
        固定: dict[tuple[str, ...], tuple[int, str, str]] = {
            ("git", "status"): (0, self.劇本["files"] if "--untracked-files=all" in a else "", ""),
            ("make", "check"): (self._輪("check_rc") if self.實作次數 else 0, "1 failed", ""),
            ("make", "mutate"): (self.劇本.get("mutate_rc", 0), "score 95", ""),
            ("git", "rev-parse"): (0, "abc123\n", ""),
            ("git", "diff"): (0, "diff --git a/x b/x\n+class 沒這個工具(KeyError): ...\n", ""),
        }
        return 固定.get(tuple(a[:2]), (0, "", ""))

    def _測試rc(self, cwd: Path | None) -> int:
        """主目錄看 main_tests_rc；worktree 實作前看 紅檢查_rc、實作後看 wt_tests_rc。"""
        if cwd is not None and ".worktrees" not in str(cwd):
            return int(self.劇本["main_tests_rc"])
        if not self.實作次數:  # 出題站：骨架搬進 worktree 後的紅檢查
            return int(self.劇本.get("紅檢查_rc", 1))
        return self._輪("wt_tests_rc")

    def _輪(self, 鍵: str) -> int:
        值 = self.劇本[鍵]
        if isinstance(值, list):
            i = min(self.實作次數 - 1, len(值) - 1)
            return int(值[i])
        return int(值)

    def _委派(self, a: list[str]) -> tuple[int, str, str]:
        角色 = a[a.index("--角色") + 1]
        if 角色 == "實作者":
            self.實作次數 += 1
            return (
                0,
                json.dumps(
                    {
                        "status": "ok",
                        "family": "codex",
                        "conversation_id": f"cid{self.實作次數}",
                        "usage": {"input": 1},
                    }
                ),
                "",
            )
        對 = [{"test": "tests/流程/test_迴圈.py::test_a", "definition": "#2"}]
        r = self.劇本.get("review", {"missing": [], "out_of_scope": [], "test_to_definition": 對})
        rc = self.劇本.get("review_rc", 0)
        if isinstance(rc, list):
            rc = int(rc[min(self.審查次數, len(rc) - 1)])
        self.審查次數 += 1
        家 = a[a.index("--家") + 1] if "--家" in a else "codex"
        return (
            rc,
            json.dumps({"status": "ok", "family": 家, "data": r}),
            "[委派] agy 已滿（97%），不硬派" if rc == 2 else "",  # noqa: PLR2004
        )


def _跑(tmp_path: Path, 劇本: dict[str, Any]) -> tuple[假執行, dict[str, Any], int]:
    (tmp_path / "docs/tasks/x").mkdir(parents=True, exist_ok=True)
    票檔 = tmp_path / "docs/tasks/x/03-停止條件.md"
    票檔.write_text(票, encoding="utf-8")
    測試檔 = tmp_path / "tests/流程/test_迴圈.py"
    if not 劇本.pop("沒測試檔", False):
        測試檔.parent.mkdir(parents=True, exist_ok=True)
        測試檔.write_text(劇本.pop("測試內容", "def test_a(): ...\n"), encoding="utf-8")
    骨架 = 劇本.pop("骨架", None)
    if 骨架 is not None:
        骨架目錄 = tmp_path / "docs/tasks/x/測試骨架"
        骨架目錄.mkdir(parents=True, exist_ok=True)
        (骨架目錄 / "03-tests_流程_test_迴圈.py.txt").write_text(骨架, encoding="utf-8")
    執 = 假執行(
        {
            "files": " M src/專案/迴圈.py\n",
            "main_tests_rc": 1,
            "wt_tests_rc": 0,
            "check_rc": 0,
            **劇本,
        }
    )
    跑 = 跑票.跑票(票檔, tmp_path, 執, ["委派"], 輪數=2, 走pr=bool(劇本.get("pr")))
    try:
        跑.全部()
    except 跑票.停 as e:
        return 執, {"result": "stopped", "station": e.站, "reason": e.原因}, 3
    except 跑票.壞 as e:
        return 執, {"result": "infra_error", "reason": str(e)}, 1
    return 執, {"result": "merged"}, 0


def test_範圍外_整串比對() -> None:
    assert 跑票.範圍外(["src/x.py", "mutants/src/x.py", "tests/a.py"], ["src/*.py"]) == [
        "mutants/src/x.py",
        "tests/a.py",
    ]


def test_驗收測試在main就綠_前置站停_一條委派都不發(tmp_path: Path) -> None:
    執, r, 碼 = _跑(tmp_path, {"main_tests_rc": 0})
    assert 碼 == 3 and r["station"] == "前置" and "沒在測" in r["reason"]
    assert not [a for a in 執.紀錄 if "--票" in a]


def test_動到範圍外_revert_然後停(tmp_path: Path) -> None:
    執, r, 碼 = _跑(tmp_path, {"files": " M src/專案/迴圈.py\n?? tests/流程/test_迴圈.py\n"})
    assert 碼 == 3 and r["station"] == "驗收" and "tests/流程/test_迴圈.py" in r["reason"]
    assert ["git", "checkout", "--", "."] in 執.紀錄 and ["git", "clean", "-fd"] in 執.紀錄


def test_兩輪都紅_第二輪帶續接_然後停(tmp_path: Path) -> None:
    執, r, 碼 = _跑(tmp_path, {"check_rc": [1, 1]})
    assert 碼 == 3 and r["station"] == "驗收" and "2 輪" in r["reason"]
    實作呼叫 = [a for a in 執.紀錄 if "--票" in a and "實作者" in a]
    assert (
        len(實作呼叫) == 2
        and "--續接" not in 實作呼叫[0]
        and 實作呼叫[1][實作呼叫[1].index("--續接") + 1] == "cid1"
    )
    assert "紅了" in 實作呼叫[1][-1]


def test_第一輪紅第二輪綠_只commit一次_審查交給另一家(tmp_path: Path) -> None:
    執, r, 碼 = _跑(tmp_path, {"check_rc": [1, 0]})
    assert 碼 == 0 and r["result"] == "merged"
    審查 = next(a for a in 執.紀錄 if "審查者" in a)
    assert 審查[審查.index("--家") + 1] == "agy" and 審查[審查.index("--權限") + 1] == "唯讀"
    assert sum(a[:2] == ["git", "commit"] for a in 執.紀錄) == 1


def test_審查說缺漏就停_不merge(tmp_path: Path) -> None:
    執, r, 碼 = _跑(
        tmp_path,
        {
            "review": {
                "missing": ["定義 2 沒測試"],
                "out_of_scope": [],
                "test_to_definition": [
                    {"test": "tests/流程/test_迴圈.py::test_a", "definition": "#2"}
                ],
            }
        },
    )
    assert 碼 == 3 and r["station"] == "審查"
    assert not [a for a in 執.紀錄 if a[:2] == ["git", "merge"]]


def test_審查那家已滿_拿掉指定家再派一次_還是拒才停(tmp_path: Path) -> None:
    執, r, 碼 = _跑(tmp_path, {"review_rc": 2})
    assert 碼 == 3 and r["station"] == "審查" and "已滿" in r["reason"]
    審查們 = [a for a in 執.紀錄 if "審查者" in a]
    assert len(審查們) == 2
    assert "--家" in 審查們[0] and "--家" not in 審查們[1]


def test_審查另一家滿_第二次不指定家就過_merge(tmp_path: Path) -> None:
    執, r, 碼 = _跑(tmp_path, {"review_rc": [2, 0]})
    assert 碼 == 0, r
    assert len([a for a in 執.紀錄 if "審查者" in a]) == 2


def test_驗收測試檔不存在_前置站停_不跑pytest(tmp_path: Path) -> None:
    執, r, 碼 = _跑(tmp_path, {"沒測試檔": True})
    assert 碼 == 3 and r["station"] == "前置" and "不存在" in r["reason"]
    assert "測試骨架/" in r["reason"]
    assert not [a for a in 執.紀錄 if a[:3] == ["uv", "run", "pytest"]]


def test_骨架與tests不同版_前置站停(tmp_path: Path) -> None:
    _, r, 碼 = _跑(tmp_path, {"骨架": "def test_a(): ...\n# 舊版\n"})
    assert 碼 == 3 and r["station"] == "前置" and "不同版" in r["reason"]
    assert "tests/流程/test_迴圈.py" in r["reason"]


def test_骨架同版或沒骨架_照跑(tmp_path: Path) -> None:
    assert _跑(tmp_path, {"骨架": "def test_a(): ...\n"})[2] == 0
    assert _跑(tmp_path, {})[2] == 0


def test_mutate紅就停(tmp_path: Path) -> None:
    _, r, 碼 = _跑(tmp_path, {"mutate_rc": 1})
    assert 碼 == 3 and r["station"] == "mutate"


def test_全綠_本地merge_刪分支刪worktree_沒有任何禁用旗標(tmp_path: Path) -> None:
    執, r, 碼 = _跑(tmp_path, {})
    assert 碼 == 0
    指令 = [" ".join(a) for a in 執.紀錄]
    assert any(s.startswith("git merge --no-ff") for s in 指令)
    assert any(s.startswith("git worktree remove") for s in 指令)
    assert any(s.startswith("git branch -d ") for s in 指令)
    assert not [s for s in 指令 if any(f" {x}" in s + " " for x in 禁止)]
    順序 = [s.split()[1] if s.startswith("git") else s.split()[0] for s in 指令]
    assert 順序.index("merge") > 順序.index("commit")


def test_沒有改動算紅_進下一輪(tmp_path: Path) -> None:
    _, r, 碼 = _跑(tmp_path, {"files": ""})
    assert 碼 == 3 and "2 輪" in r["reason"]


def test_驗收測試收集錯誤不算紅_前置站停(tmp_path: Path) -> None:
    _, r, 碼 = _跑(tmp_path, {"main_tests_rc": 2})
    assert 碼 == 3 and r["station"] == "前置" and "收集" in r["reason"]


def test_pr路徑_merge從主目錄跑_push與create在worktree_最後仍刪本地分支(tmp_path: Path) -> None:
    執, r, 碼 = _跑(tmp_path, {"pr": True})
    assert 碼 == 0
    位置 = {" ".join(a[:3]): d for a, d in zip(執.紀錄, 執.目錄紀錄, strict=True)}
    assert 位置["gh pr merge"] == tmp_path, (
        "gh pr merge 從 worktree 跑會撞 main 被佔用（2026-09-05 E2E）"
    )
    assert 位置["git push -u"] == tmp_path / ".worktrees" / "x-03-停止條件"
    assert 位置["gh pr create"] == tmp_path / ".worktrees" / "x-03-停止條件"
    assert "git pull --ff-only" in 位置 and "git branch -d" in 位置
    全部 = " ".join(" ".join(a) for a in 執.紀錄)
    assert "--delete-branch" not in 全部, "會去刪被 worktree 佔的本地分支（E2E #2）"
    assert not [a for a in 執.紀錄 if a[:2] == ["git", "merge"]]


def test_slug含feature目錄_同編號不同feature不撞名(tmp_path: Path) -> None:
    執, _, _ = _跑(tmp_path, {})
    assert any(a[:3] == ["git", "worktree", "add"] and a[4] == "x-03-停止條件" for a in 執.紀錄)


def test_pytest內部錯或用法錯_不是紅_前置站停(tmp_path: Path) -> None:
    for rc in (3, 4):
        _, r, 碼 = _跑(tmp_path, {"main_tests_rc": rc})
        assert 碼 == 3 and r["station"] == "前置" and str(rc) in r["reason"]


def test_rename行只算新路徑(tmp_path: Path) -> None:
    _, r, 碼 = _跑(tmp_path, {"files": "R  src/專案/舊.py -> src/專案/迴圈.py\n"})
    assert 碼 == 0, r


def test_驗收測試在單元或流程底下_不重跑pytest(tmp_path: Path) -> None:
    執, _, 碼 = _跑(tmp_path, {})
    assert 碼 == 0
    在worktree = [
        a
        for a, d in zip(執.紀錄, 執.目錄紀錄, strict=True)
        if a[:3] == ["uv", "run", "pytest"] and d != tmp_path
    ]
    assert not 在worktree


def test_審查沒把驗收測試對到定義_算敷衍_停(tmp_path: Path) -> None:
    劇本: dict[str, Any] = {"review": {"missing": [], "out_of_scope": [], "test_to_definition": []}}
    _, r, 碼 = _跑(tmp_path, 劇本)
    assert 碼 == 3 and r["station"] == "審查" and "沒把驗收測試對到" in r["reason"]


def test_失敗摘要只留FAILED與E行() -> None:
    文 = "collecting...\nplatform darwin\nFAILED tests/a.py::t - assert 1 == 2\n"
    文 += "E       assert 1 == 2\n1 failed\n"
    出 = 跑票.失敗摘要(文)
    assert "FAILED" in 出 and "E       assert" in 出 and "platform" not in 出


def test_merge後刷新額度快照(tmp_path: Path) -> None:
    執, _, 碼 = _跑(tmp_path, {})
    assert 碼 == 0 and 執.紀錄[-1] == ["委派", "刷新"]


def test_審查prompt直接附diff_不叫它自己跑git(tmp_path: Path) -> None:
    執, _, 碼 = _跑(tmp_path, {})
    assert 碼 == 0
    審查 = next(a for a in 執.紀錄 if "審查者" in a)
    assert "+class 沒這個工具" in 審查[-1] and "不要再跑 git" in 審查[-1]
    在主目錄 = [
        a
        for a, d in zip(執.紀錄, 執.目錄紀錄, strict=True)
        if a[:2] == ["git", "diff"] and d == tmp_path
    ]
    assert not 在主目錄


def test_截diff_太長會截並說明() -> None:
    出 = 跑票.截diff("x" * 20000, 上限=100)
    assert len(出) < 300 and "共 20000 字" in 出 and 跑票.截diff("短") == "短"


def test_主線沒測試但有骨架_搬進worktree_出題commit_紅檢查在worktree(tmp_path: Path) -> None:
    執, r, 碼 = _跑(tmp_path, {"沒測試檔": True, "骨架": "def test_a(): assert False\n"})
    assert 碼 == 0, r
    搬到 = tmp_path / ".worktrees/x-03-停止條件/tests/流程/test_迴圈.py"
    assert 搬到.read_text(encoding="utf-8") == "def test_a(): assert False\n"
    commit們 = [a for a in 執.紀錄 if a[:2] == ["git", "commit"]]
    assert commit們 and "出題" in commit們[0][-1]
    紅檢查 = [
        (a, d)
        for a, d in zip(執.紀錄, 執.目錄紀錄, strict=True)
        if a[:3] == ["uv", "run", "pytest"]
    ]
    assert len(紅檢查) == 1 and ".worktrees" in str(紅檢查[0][1])  # 只在 worktree 跑，不在主線


def test_主線沒測試也沒骨架_前置站停(tmp_path: Path) -> None:
    _, r, 碼 = _跑(tmp_path, {"沒測試檔": True})
    assert 碼 == 3 and r["station"] == "前置" and "沒有骨架" in r["reason"]


def test_骨架搬進去就綠_出題站停(tmp_path: Path) -> None:
    _, r, 碼 = _跑(tmp_path, {"沒測試檔": True, "骨架": "def test_a(): ...\n", "紅檢查_rc": 0})
    assert 碼 == 3 and r["station"] == "出題" and "沒在測" in r["reason"]


def test_ts驗收走bun_test_不走pytest(tmp_path: Path) -> None:
    (tmp_path / "docs/tasks/x").mkdir(parents=True)
    票檔 = tmp_path / "docs/tasks/x/02-layout.md"
    票檔.write_text(
        "# 02\n- 可碰檔案：`plugins/telltale/hooks/layout.ts`\n"
        "- 驗收測試：`plugins/telltale/hooks/layout.test.ts`\n",
        encoding="utf-8",
    )
    骨架目錄 = tmp_path / "docs/tasks/x/測試骨架"
    骨架目錄.mkdir()
    (骨架目錄 / "02-hooks_layout.test.ts.txt").write_text(
        "test('a', () => {});\n", encoding="utf-8"
    )
    對 = [{"test": "plugins/telltale/hooks/layout.test.ts", "definition": "§1.2"}]
    執 = 假執行(
        {
            "files": " M plugins/telltale/hooks/layout.ts\n",
            "main_tests_rc": 1,
            "wt_tests_rc": 0,
            "check_rc": 0,
            "review": {"missing": [], "out_of_scope": [], "test_to_definition": 對},
        }
    )
    跑票.跑票(票檔, tmp_path, 執, ["委派"], 輪數=2).全部()
    bun們 = [a for a in 執.紀錄 if a[:2] == ["bun", "test"]]
    assert bun們 == [
        ["bun", "test", "plugins/telltale/hooks/layout.test.ts"]
    ]  # 出題站紅檢查；驗收站由 make check 涵蓋
    assert not [a for a in 執.紀錄 if a[:3] == ["uv", "run", "pytest"]]


def test_分家() -> None:
    assert 跑票.分家(["tests/a.py", "hooks/b.test.ts", "hooks/c.test.tsx"]) == (
        ["tests/a.py"],
        ["hooks/b.test.ts", "hooks/c.test.tsx"],
    )
