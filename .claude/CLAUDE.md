# CLAUDE.md

## 這個專案是什麼
- 專案名：telltale（GitHub public：ryu111/telltale）
- 一句話目標：Claude Code 的常駐狀態帶 plugin，多個獨立面板由一個框架統一調度，只用 function hooks 的 `ui.render{AbovePrompt}`。
- Pipeline（產品的執行流程，不是開發流程）：面板 `poll` → `$.store` 快取 → `layout()` 分配列數 → 面板 `view()` 產生列 → `Client`（band.tsx）畫出來並收滑鼠
- 目錄分兩層（2026-09-17 使用者裁定）：根是 marketplace＋開發工具，plugin 本體整個在 `plugins/telltale/`；SDD 與票裡寫的 `hooks/…` 都相對那裡。bun 測試與 harness 在 `tests/hooks/`（plugin 目錄只放功能），突變清單在 `tests/突變/`。
- 定義本體：`docs/SDD.md`；任務：`docs/tasks/<feature>/NN-<slug>.md`；tracker 設定：`docs/agents/issue-tracker.md`（mattpocock 的 skill 讀這份）
- 受眾是全世界：程式碼註解、README 用英文；docs/ 與票用中文。

## 起手式
```bash
uv sync            # 第一次，或改了相依之後（只裝跑票工具，plugin 本體不用 Python）
make check         # commit 前的閘：ruff + mypy + scripts/ 的單元測試（plugin 的閘見下）
# 平常：~/.claude/skills/telltale → plugins/telltale 的 symlink，settings.json env 已開 CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1，
# 直接 `claude` 就載入（telltale@skills-dir，跟 checkout 同一份，不用 install、不會被版本綁住；改檔重開 session）。
claude --plugin-dir "$PWD/plugins/telltale" --debug-file /tmp/tt.log   # 要熱重載或看 debug log 時；同名時它優先於 skills-dir
claude plugin validate --strict plugins/telltale    # calls: 那行只准 $.ui.* $.clock.* $.store.* $.command.register $.env.get
claude plugin validate --strict .      # 根目錄是 marketplace（.claude-plugin/marketplace.json），plugin 住 plugins/telltale/
```
一律走 `uv run`，不要先 activate venv。
型別檔 `.claude/types/claude-code.d.ts` 不進 repo（2026-09-17 裁定）：clone 後在 session 跑 `/plugin-types` 自己產；升版重產。閘不依賴它。

## 專案級 hook（`.claude/hooks/`）
- PreToolUse：`docs/tasks/目前` 存在時，Edit／Write 只放行該票「可碰檔案」，其餘 exit 2。
- PostToolUse：改 .py 就 ruff format＋check＋mypy，紅了 exit 2。

## 這個 repo 的坑
（看檔案看不出來、踩到會很貴、下次還會再踩的，才寫在這裡）
- 2026-09-17 升到 **2.1.274**（`claude install latest`；stable 頻道停在 2.1.267）。274 的破壞性改動：`hooks.json` 的 `surface` 欄位拿掉，Client 改 `module="./band.tsx"`（相對路徑字面值）；`$.clock.now()` 變 **async**（Promise 塞進 Client props 會被拒繪「a class instance」）；`claude plugin test <dir>` **存在了**（測試 import `claude-code/testing`），v0.2 要決定要不要從 bun 搬過去；Pane 會自適應（≥~140 欄靠右 dock，窄了落到輸入框上方的方框，實測 150→100 欄）；AbovePrompt 的 `e.viewport.columns` 仍＝終端寬，但開著 Pane 時是扣掉 Pane 的寬。
- `claude plugin test` 在 2.1.267 **不存在**（帶 `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` 也沒有；`plugin --help` 只有 validate／eval／init 等）。題目 DoD #2 改成自建 harness。2026-09-17 查：npm latest 是 2.1.274 但 native installer 的 stable channel 停在 2.1.267，`claude update` 不會升。
- `which claude` 指到 cmux 的 shim（bash script），要 grep 真 binary 看 `~/.local/share/claude/versions/<ver>`。
- function hooks 相關字串（`AbovePrompt`、`bodyColumns`、`onPointer`、`hooks module`）在 2.1.267 binary 裡都有，機制存在，只是被旗標關著。
- 2026-09-18：**Claude Desktop 內建的 2.1.266（stream-json headless）也會載入這個 plugin**（skills-dir symlink＋settings env），它的 `$.agent.list` 一律丟 `not available in this mode: no session is bound`，而且 store 檔是同一個 plugin 所有 session 共用（`~/.claude/plugins/store/telltale_<provenance>.json`）——Desktop 的 4 個 session 每秒寫錯誤與 cell，終端機那條帶子讀到就顯示。票 26 起 `e.isInteractive === false` 整個不動、live 鍵按 `$.session.id()` 分（SDD §2.8）。舊 store 檔裡 v0.2 留下的裸 `agents.cells`／`error.agents` 沒人讀也沒人清。
- macOS 沒有 `timeout`（coreutils 的）；真機腳本要等 claude 就用 `python3 -c "import time;time.sleep(N)"`（前景 `sleep` 被 hook 擋）。

## Agent skills

### Issue tracker

Local markdown：spec 在 `docs/SDD.md`，票在 `docs/tasks/<feature>/NN-<slug>.md`。See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context：根目錄 `CONTEXT.md` ＋ `docs/adr/`（缺就略過，由 domain-modeling 懶建）。See `docs/agents/domain.md`.
- template 的 `scripts/跑票.py` 原本只認 pytest、且要求驗收測試先在主線上（紅）；/拆任務 skill 說的「骨架自動搬進 worktree」template 沒做。本 repo 已改：主線沒有的驗收測試從 `docs/tasks/<feature>/測試骨架/*<檔名>.txt` 搬進 worktree、commit「出題」、在 worktree 看紅；`.test.ts(x)` 走 `bun test`。**這是 template 該回收的修正。**
- `bun test <目錄>` 在目錄裡沒有任何 `*.test.*` 時退出碼 1（不是 0），`make check` 用 find 先擋；空的 `.test.ts` 檔（0 個 test）退出碼 0。
- `mattpocock-skills:to-tickets` 沒裝在這台（plugin 只裝了部分 skill），票照 `docs/tasks/00-範本.md` 手寫。
- 〔票 01 實測〕`userConfig` 的鍵不能含 `.`（`panel.hello` → `Invalid input`）；plugin 根目錄有 `CLAUDE.md` 在 `validate --strict` 會 exit 1，所以本檔住 `.claude/CLAUDE.md`。`.gitignore` 不支援行內 `# 註解`（會變成 pattern 的一部分）。
- 〔票 01 實測〕`e.viewport.columns` = 終端寬（150 欄回 150），`maxRows` 在 34 列終端回 9。
- 「加一個新面板」的 checklist 等下一輪開 git 面板時做成 `.claude/skills/新面板/`（2026-09-17 裁定，三次法則）；這輪不做。

## Graphify（每個專案都要有自己的圖，2026-09-18）
- 問「哪裡呼叫 X」「A 到 B 怎麼接」「這個模組跟誰有關」：先 `graphify query "<問題>" --budget 800`／`graphify explain "<節點>"`／`graphify path "A" "B"`，再讀檔。派工 brief 開頭也給子代理一條 `graphify explain`。
- `graphify-out/graph.json` 與 `GRAPH_REPORT.md` 進 git；post-commit hook 每次 commit 純 AST 重建（不花 token）。docs/ 改很多才 `/graphify . --update`（那才花 token）。
