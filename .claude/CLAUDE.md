# CLAUDE.md

## 這個專案是什麼
- 專案名：telltale（GitHub public：ryu111/telltale）
- 一句話目標：Claude Code 的常駐狀態帶 plugin，多個獨立面板由一個框架統一調度，只用 function hooks 的 `ui.render{AbovePrompt}`。
- Pipeline（產品的執行流程，不是開發流程）：面板 `poll` → `$.store` 快取 → `layout()` 分配列數 → 面板 `view()` 產生列 → `Client`（band.tsx）畫出來並收滑鼠
- 目錄分兩層（2026-09-17 使用者裁定）：根是 marketplace＋開發工具，plugin 本體整個在 `plugins/telltale/`；SDD 與票裡寫的 `hooks/…` 都相對那裡。突變清單在 `tests/突變/`。
- 定義本體：`docs/SDD.md`；任務：`docs/tasks/<feature>/NN-<slug>.md`；tracker 設定：`docs/agents/issue-tracker.md`（mattpocock 的 skill 讀這份）
- 受眾是全世界：程式碼註解、README 用英文；docs/ 與票用中文。

## 起手式
```bash
uv sync            # 第一次，或改了相依之後（只裝跑票工具，plugin 本體不用 Python）
make check         # commit 前的閘：ruff + mypy + scripts/ 的單元測試（plugin 的閘見下）
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude --plugin-dir "$PWD/plugins/telltale" --debug-file /tmp/tt.log   # 開發模式，存檔熱重載
claude plugin validate --strict plugins/telltale    # calls: 那行只准 $.ui.* $.clock.* $.store.* $.command.register $.env.get
claude plugin validate --strict .      # 根目錄是 marketplace（.claude-plugin/marketplace.json），plugin 住 plugins/telltale/
```
一律走 `uv run`，不要先 activate venv。

## 專案級 hook（`.claude/hooks/`）
- PreToolUse：`docs/tasks/目前` 存在時，Edit／Write 只放行該票「可碰檔案」，其餘 exit 2。
- PostToolUse：改 .py 就 ruff format＋check＋mypy，紅了 exit 2。

## 這個 repo 的坑
（看檔案看不出來、踩到會很貴、下次還會再踩的，才寫在這裡）
- `claude plugin test` 在 2.1.267 **不存在**（帶 `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` 也沒有；`plugin --help` 只有 validate／eval／init 等）。題目 DoD #2 改成自建 harness。2026-09-17 查：npm latest 是 2.1.274 但 native installer 的 stable channel 停在 2.1.267，`claude update` 不會升。
- `which claude` 指到 cmux 的 shim（bash script），要 grep 真 binary 看 `~/.local/share/claude/versions/<ver>`。
- function hooks 相關字串（`AbovePrompt`、`bodyColumns`、`onPointer`、`hooks module`）在 2.1.267 binary 裡都有，機制存在，只是被旗標關著。

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
