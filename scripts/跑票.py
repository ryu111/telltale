#!/usr/bin/env python3
"""跑票：一張已核准的票，從派工走到 merge；停下來就出報告。

    make ticket T=docs/tasks/<feature>/NN-<slug>.md

站：前置（驗收測試在 main 上要紅）→ worktree → 委派實作（家 X）
  → 驗收（diff 對照可碰檔案、make check、驗收測試綠）→ 紅了用 --續接 再一輪（最多 --輪數）
  → 委派審查（另一家，Spec 軸）→ make mutate → merge、刪分支與 worktree。

退出碼：0 merge 了；3 停下來等人（報告說在哪站、為什麼）；1 基礎設施壞。
stdout 最後一行是 JSON 報告。
出題那站不在這裡：票要先由人核准。題目錯（審查說缺漏、兩輪都紅）一律停，不改題目。
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import subprocess
import sys
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from fnmatch import fnmatchcase
from pathlib import Path
from typing import Any

執行器型 = Callable[[Sequence[str], Path | None], tuple[int, str, str]]
結構目錄 = Path(__file__).resolve().parent / "schema"
另一家 = {"codex": "agy", "agy": "codex"}
_check涵蓋 = ("tests/單元", "tests/流程")
_pytest沒收到測試 = 5
_pytest收集錯誤 = 2
_pytest自己壞 = (3, 4)  # 內部錯誤、用法錯誤：不是紅，是題目或環境壞
_委派拒絕 = 2  # 委派.py 拒絕（已滿、參數錯…），理由在 stderr


class 停(Exception):  # noqa: N818
    """停下來等人（退出碼 3）。"""

    def __init__(self, 站: str, 原因: str) -> None:
        super().__init__(f"{站}：{原因}")
        self.站, self.原因 = 站, 原因


class 壞(Exception):  # noqa: N818
    """基礎設施壞（退出碼 1）。"""

    def __init__(self, *, 原因: str) -> None:
        super().__init__(原因)
        self.原因 = 原因


@dataclass
class 報告:
    """每站的數字，最後印成一行 JSON。"""

    ticket: str
    stations: list[dict[str, Any]] = field(default_factory=list)

    def 記(self, 站: str, **數字: object) -> None:
        self.stations.append({"station": 站, **數字})


# ── 純函式 ──
def 欄位(票文字: str, 名: str) -> list[str]:
    """跟 .claude/hooks/scripts/範圍.py 同一套：欄名在行上、反引號一段一個 glob。"""
    for 行 in 票文字.splitlines():
        if 名 in 行:
            return re.findall(r"`([^`]+)`", 行)
    return []


def 範圍外(路徑們: Sequence[str], 可碰: Sequence[str]) -> list[str]:
    """整串比對，跟範圍 hook 一樣：`mutants/src/x.py` 不會被 `src/x.py` 放行。"""
    return [p for p in 路徑們 if not any(fnmatchcase(p, g) for g in 可碰)]


def 骨架不同版(根: Path, 骨架目錄: Path, 驗收: Sequence[str]) -> list[str]:
    """驗收測試若在 `測試骨架/` 有同名 `.txt`（檔名以 `<測試檔名>.txt` 結尾），內容必須一字不差。

    沒骨架的測試不管；有骨架但內容不同 = 搬錯版、或補題後沒 cp 回去，實作者會對到舊題。
    """
    if not 骨架目錄.is_dir():
        return []
    不同 = []
    for 樣式 in 驗收:
        for 測試 in sorted(根.glob(樣式)):
            if not 測試.is_file():
                continue
            對應 = sorted(骨架目錄.glob(f"*{測試.name}.txt"))
            if 對應 and 對應[-1].read_text(encoding="utf-8") != 測試.read_text(encoding="utf-8"):
                不同.append(str(測試.relative_to(根)))
    return 不同


def 失敗摘要(文字: str, 最多行: int = 40) -> str:
    """只留 FAILED／ERROR／E 行。

    餵回實作者的是「哪支測試、什麼斷言」，不是整段輸出，免得它迎合錯誤訊息。
    """
    樣式 = re.compile(r"(FAILED|ERROR|E\s|.*error:)")
    行們 = [行 for 行 in 文字.splitlines() if 樣式.match(行)]
    if not 行們:
        行們 = 文字.strip().splitlines()[-20:]
    return "\n".join(行們[-最多行:])


def 截diff(文字: str, 上限: int = 12000) -> str:
    """diff 直接塞進審查 prompt，省它自己跑 git 那一回合；太長就截，並說明截了多少。"""
    if len(文字) <= 上限:
        return 文字
    return 文字[:上限] + f"\n… [diff 共 {len(文字)} 字，只附前 {上限} 字；其餘請自行 git diff]"


def 真的執行(argv: Sequence[str], cwd: Path | None) -> tuple[int, str, str]:
    """唯一碰 subprocess 的地方；測試換成假的。"""
    r = subprocess.run(list(argv), cwd=cwd, capture_output=True, text=True, check=False)  # noqa: S603
    return r.returncode, r.stdout, r.stderr


def 最後一行json(文字: str) -> dict[str, Any]:
    """先找最後一行是 JSON 的；委派.py 印多行縮排 JSON，所以整段再試一次。"""
    for 行 in reversed(文字.strip().splitlines()):
        try:
            d = json.loads(行)
        except ValueError:
            continue
        if isinstance(d, dict):
            return d
    # 委派.py 印的是多行縮排 JSON：整段再試一次
    try:
        d = json.loads(文字)
    except ValueError:
        return {}
    return d if isinstance(d, dict) else {}


# ── 跑票 ──
@dataclass
class 跑票:
    """狀態都在這裡；每站一個方法，方法只做一件事。"""

    票路徑: Path
    根: Path
    執行: 執行器型
    委派: Sequence[str]
    輪數: int = 2
    逾時秒: int = 1800
    走pr: bool = False
    報告: 報告 = field(init=False)
    票文字: str = field(init=False)
    可碰: list[str] = field(init=False)
    驗收: list[str] = field(init=False)
    slug: str = field(init=False)
    worktree: Path = field(init=False)
    base: str = field(init=False)
    實作家: str = field(init=False, default="")

    def __post_init__(self) -> None:
        self.報告 = 報告(str(self.票路徑))
        self.票文字 = self.票路徑.read_text(encoding="utf-8")
        self.可碰 = 欄位(self.票文字, "可碰檔案")
        self.驗收 = 欄位(self.票文字, "驗收測試")
        if not self.可碰 or not self.驗收:
            raise 停(站="前置", 原因="票缺「可碰檔案」或「驗收測試」那一行")
        # slug 含 feature 目錄：兩個 feature 同編號的票並行時 worktree／分支才不會撞名。
        try:
            相對 = self.票路徑.resolve().relative_to((self.根 / "docs" / "tasks").resolve())
        except ValueError:
            相對 = Path(self.票路徑.name)
        self.slug = re.sub(r"\.md$", "", "-".join(相對.parts))
        self.worktree = self.根 / ".worktrees" / self.slug

    # 站 0：前置
    def 前置(self) -> None:
        rc, out, _ = self.執行(["git", "status", "--porcelain"], self.根)
        if rc != 0 or out.strip():
            raise 停(站="前置", 原因="主目錄不乾淨，先 commit 或 stash")
        缺 = [p for p in self.驗收 if not list(self.根.glob(p))]
        if 缺:
            raise 停(
                站="前置",
                原因=f"驗收測試檔不存在：{'、'.join(缺)}（票文寫錯層？tests/單元 vs tests/流程）",
            )
        不同 = 骨架不同版(self.根, self.票路徑.parent / "測試骨架", self.驗收)
        if 不同:
            raise 停(
                站="前置",
                原因=f"測試骨架與 tests/ 不同版：{'、'.join(不同)}（搬錯版或改了沒 cp 回去）",
            )
        rc, out, _ = self.執行(
            ["uv", "run", "pytest", *self.驗收, "-x", "-q", "-p", "no:cacheprovider"], self.根
        )
        self.報告.記("前置", tests_exit_on_main=rc)
        if rc == 0:
            raise 停(站="前置", 原因="驗收測試在 main 上就是綠的：題目沒在測東西")
        if rc == _pytest沒收到測試:
            raise 停(站="前置", 原因="驗收測試一支都沒收到：路徑錯或還沒寫")
        if rc == _pytest收集錯誤:
            raise 停(
                站="前置", 原因="驗收測試收集就錯（import 錯、名字打錯）：那不是紅，是題目壞了"
            )
        if rc in _pytest自己壞:
            raise 停(
                站="前置", 原因=f"pytest 退出碼 {rc}（內部錯或用法錯）：不是紅，先修環境或路徑"
            )
        rc, out, _ = self.執行(["git", "rev-parse", "HEAD"], self.根)
        self.base = out.strip()

    # 站 2：worktree
    def 開worktree(self) -> None:
        rc, _, err = self.執行(
            ["git", "worktree", "add", "-b", self.slug, str(self.worktree), "HEAD"], self.根
        )
        if rc != 0:
            raise 壞(原因=f"worktree 開不起來：{err.strip()[-200:]}")
        rc, _, err = self.執行(["uv", "sync"], self.worktree)
        if rc != 0:
            raise 壞(原因=f"uv sync 失敗：{err.strip()[-200:]}")
        self.報告.記("worktree", path=str(self.worktree), base=self.base)

    # 站 3：實作
    def _委派跑(self, 角色: str, 補充: str, *, 家: str | None, 續接: str | None) -> dict[str, Any]:
        argv = [
            *self.委派,
            "跑",
            "--票",
            str(self.票路徑.resolve()),
            "--角色",
            角色,
            "--工作",
            "例行",
            "--權限",
            "唯讀" if 角色 == "審查者" else "可編輯",
            "--目錄",
            str(self.worktree),
            "--逾時秒",
            str(self.逾時秒),
            "--結構",
            str(結構目錄 / f"{角色}.json"),
        ]
        if 家:
            argv += ["--家", 家]
        if 續接:
            argv += ["--續接", 續接]
        if 補充:
            argv.append(補充)
        rc, out, err = self.執行(argv, self.worktree)
        r = 最後一行json(out)
        r.setdefault("status", "infra_error" if rc else "unknown")
        r["delegate_exit"] = rc
        r["stderr_tail"] = err[-400:]
        return r

    def 實作(self, 輪: int, 續接: str | None, 補充: str) -> dict[str, Any]:
        r = self._委派跑("實作者", 補充, 家=self.實作家 or None, 續接=續接)
        self.報告.記(
            "實作",
            round=輪,
            family=r.get("family"),
            status=r["status"],
            usage=r.get("usage"),
            conversation_id=r.get("conversation_id"),
        )
        if r["status"] == "fallback_claude":
            raise 停(站="實作", 原因="兩家都滿或都跑不起來：交回 Claude 派 實作者 subagent")
        if r["status"] != "ok":
            raise 壞(原因=f"委派 {r['status']}：{r.get('stderr_tail', '')[-200:]}")
        self.實作家 = str(r.get("family") or "")
        return r

    # 站 4：驗收
    def 動到的檔案(self) -> list[str]:
        rc, out, _ = self.執行(
            # 坑：git 預設把非 ASCII 路徑加引號逸出（"src/\345..."），glob 就對不上。
            ["git", "-c", "core.quotePath=false", "status", "--porcelain", "--untracked-files=all"],
            self.worktree,
        )
        路徑們 = [行[3:].strip() for 行 in out.splitlines() if 行.strip()]
        # rename 行長 `R  old -> new`：只算新路徑。
        return [路.split(" -> ", 1)[1] if " -> " in 路 else 路 for 路 in 路徑們]

    def 驗收一輪(self, 輪: int) -> str | None:
        """回 None 表示綠；回字串是失敗摘要（餵下一輪）。範圍外直接停。"""
        檔案 = self.動到的檔案()
        外 = 範圍外(檔案, self.可碰)
        if 外:
            self.執行(["git", "checkout", "--", "."], self.worktree)
            self.執行(["git", "clean", "-fd"], self.worktree)
            if self.動到的檔案():
                raise 壞(原因=f"範圍外的檔案 revert 不掉：{'、'.join(self.動到的檔案())}")
            raise 停(站="驗收", 原因=f"動到範圍外的檔案，已 revert：{'、'.join(外)}")
        if not 檔案:
            return "沒有任何改動"
        rc, out, err = self.執行(["make", "check"], self.worktree)
        rc2, out2 = 0, ""
        沒涵蓋 = [t for t in self.驗收 if not t.startswith(_check涵蓋)]
        if 沒涵蓋:  # make check 已跑 tests/單元 與 tests/流程，不重跑
            rc2, out2, _ = self.執行(
                ["uv", "run", "pytest", *沒涵蓋, "-q", "-p", "no:cacheprovider"], self.worktree
            )
        self.報告.記("驗收", round=輪, files=檔案, check_exit=rc, tests_exit=rc2)
        if rc == 0 and rc2 == 0:
            return None
        return f"make check 退出碼 {rc}；驗收測試退出碼 {rc2}\n{失敗摘要(out + err + out2)}"

    def 實作到綠(self) -> None:
        續接: str | None = None
        補充 = ""
        for 輪 in range(1, self.輪數 + 1):
            r = self.實作(輪, 續接, 補充)
            失敗 = self.驗收一輪(輪)
            if 失敗 is None:
                return
            續接, 補充 = r.get("conversation_id"), f"上一輪驗收紅了，修到綠：\n{失敗}"
        raise 停(站="驗收", 原因=f"{self.輪數} 輪都紅：回出題看是實作錯還是題目錯")

    def commit(self) -> str:
        self.執行(["git", "add", "-A"], self.worktree)
        rc, _, err = self.執行(
            ["git", "commit", "-q", "-m", f"{self.slug}：跑票實作（{self.實作家}）"], self.worktree
        )
        if rc != 0:
            raise 壞(原因=f"commit 失敗：{err.strip()[-200:]}")
        rc, out, _ = self.執行(["git", "rev-parse", "HEAD"], self.worktree)
        return out.strip()

    # 站 4b：審查（另一家）
    def 審查(self, commit: str) -> None:
        _, diff, _ = self.執行(["git", "diff", f"{self.base}..{commit}"], self.worktree)
        補充 = (
            f"base commit：{self.base}；實作 commit：{commit}。"
            "改動的 diff 已附在下面，不要再跑 git。\n---- diff ----\n" + 截diff(diff)
        )
        指定家 = 另一家.get(self.實作家)
        r = self._委派跑("審查者", 補充, 家=指定家, 續接=None)
        if r["delegate_exit"] == _委派拒絕 and 指定家:
            # 另一家額度滿：不硬派，拿掉 --家 讓委派.py 自己平衡；兩家都不行才停。
            self.報告.記("審查", family=指定家, status="refused", stderr=r["stderr_tail"][-200:])
            r = self._委派跑("審查者", 補充, 家=None, 續接=None)
        資料 = r.get("data") or {}
        self.報告.記(
            "審查",
            family=r.get("family"),
            status=r["status"],
            missing=資料.get("missing"),
            out_of_scope=資料.get("out_of_scope"),
        )
        if r["delegate_exit"] == _委派拒絕:
            raise 停(站="審查", 原因=f"委派拒絕派審查：{r['stderr_tail'].strip()[-200:]}")
        if r["status"] == "fallback_claude":
            raise 停(站="審查", 原因="兩家都不行：交回 Claude 做 code-review Spec 軸")
        if r["status"] != "ok" or not isinstance(資料, dict) or "missing" not in 資料:
            raise 停(站="審查", 原因=f"審查沒回結構化結果（{r['status']}）")
        對到 = {str(x.get("test", "")) for x in 資料.get("test_to_definition") or []}
        沒對到 = [t for t in self.驗收 if not any(x.startswith(t) for x in 對到)]
        if 沒對到:
            raise 停(站="審查", 原因=f"審查沒把驗收測試對到定義：{'、'.join(沒對到)}（敷衍或沒讀）")
        if 資料.get("missing") or 資料.get("out_of_scope"):
            raise 停(
                站="審查",
                原因=f"Spec 軸沒過：缺漏 {資料.get('missing')}；超範圍 {資料.get('out_of_scope')}",
            )

    # 站 5：mutate + merge
    def mutate(self) -> None:
        rc, out, _ = self.執行(["make", "mutate"], self.worktree)
        self.報告.記(
            "mutate", exit=rc, last_line=out.strip().splitlines()[-1] if out.strip() else ""
        )
        if rc != 0:
            raise 停(站="mutate", 原因="mutation 門檻沒過：測試是自證式的，回出題補題")

    def merge(self) -> None:
        if self.走pr:
            # 坑：gh pr merge 要 checkout main，從 worktree 跑會撞「main 被主目錄佔用」。
            # push 與 create 在 worktree，merge 與 pull 回主目錄。
            步驟 = (
                (["git", "push", "-u", "origin", self.slug], self.worktree),
                (["gh", "pr", "create", "--fill", "--head", self.slug], self.worktree),
                # 不帶 --delete-branch：它會去刪被 worktree 佔用的本地分支而失敗（E2E #2）；
                # 遠端分支交給 repo 的 delete-branch-on-merge，下面再補刪一次。
                (["gh", "pr", "merge", self.slug, "--merge"], self.根),
                (["git", "pull", "--ff-only"], self.根),
            )
            for argv, 目錄 in 步驟:
                rc, _, err = self.執行(argv, 目錄)
                if rc != 0:
                    raise 壞(原因=f"{' '.join(argv[:3])} 失敗：{err.strip()[-200:]}")
        else:
            rc, _, err = self.執行(
                ["git", "merge", "--no-ff", "-q", "-m", f"merge {self.slug}", self.slug], self.根
            )
            if rc != 0:
                raise 壞(原因=f"merge 失敗：{err.strip()[-200:]}")
        rc, _, err = self.執行(["git", "worktree", "remove", str(self.worktree)], self.根)
        if rc != 0:
            raise 壞(原因=f"worktree 移不掉（髒？）：{err.strip()[-200:]}")
        self.執行(["git", "branch", "-d", self.slug], self.根)
        if self.走pr:  # 已被 repo 設定刪掉就會失敗，無妨
            self.執行(["git", "push", "origin", "--delete", self.slug], self.根)
        self.報告.記("merge", pr=self.走pr, branch_deleted=True, worktree_removed=True)

    def 全部(self) -> None:
        self.前置()
        self.開worktree()
        self.實作到綠()
        commit = self.commit()
        self.審查(commit)
        self.mutate()
        self.merge()
        # 收尾拍一張額度快照：「一票吃幾 %」靠這個算；失敗無妨。
        self.執行([*self.委派, "刷新"], self.根)


def main(argv: list[str] | None = None) -> int:
    """入口：組 跑票、跑、印報告、換退出碼。"""
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument("票")
    p.add_argument("--輪數", type=int, default=2)
    p.add_argument("--逾時秒", type=int, default=1800)
    p.add_argument("--pr", action="store_true", help="走 GitHub PR merge（預設本地 merge --no-ff）")
    p.add_argument(
        "--委派",
        default=os.environ.get("委派_CMD") or f"python3 {Path.home() / '.claude/scripts/委派.py'}",
        help="委派 gateway 指令",
    )
    a = p.parse_args(argv)
    根 = Path.cwd()
    try:
        跑 = 跑票(
            Path(a.票), 根, 真的執行, shlex.split(a.委派), 輪數=a.輪數, 逾時秒=a.逾時秒, 走pr=a.pr
        )
        跑.全部()
        結果, 碼 = {"result": "merged"}, 0
    except 停 as e:
        結果, 碼 = {"result": "stopped", "station": e.站, "reason": e.原因}, 3
    except 壞 as e:
        結果, 碼 = {"result": "infra_error", "reason": str(e)}, 1
    報告物 = 跑.報告 if "跑" in locals() else 報告(a.票)
    整份 = {**結果, "ticket": 報告物.ticket, "stations": 報告物.stations}
    紀錄 = 根 / ".claude" / "跑票紀錄.jsonl"  # 之後才算得出「卡在哪站」的統計
    紀錄.parent.mkdir(exist_ok=True)
    with 紀錄.open("a", encoding="utf-8") as f:
        f.write(json.dumps({"ts": int(time.time()), **整份}, ensure_ascii=False) + "\n")
    sys.stdout.write(json.dumps(整份, ensure_ascii=False) + "\n")
    return 碼


if __name__ == "__main__":
    sys.exit(main())
