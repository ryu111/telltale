# CLAUDE.md

## 這個專案是什麼
- 專案名：＿＿＿
- 一句話目標：＿＿＿
- Pipeline（產品的執行流程，不是開發流程）：＿＿＿ → ＿＿＿ → ＿＿＿
- 定義本體：`docs/SDD.md`；任務：`docs/tasks/<feature>/NN-<slug>.md`；tracker 設定：`docs/agents/issue-tracker.md`（mattpocock 的 skill 讀這份）

## 起手式
```bash
uv sync            # 第一次，或改了相依之後
make check         # commit 前的閘：ruff + mypy + 單元 + 流程，十秒內
make eval          # 真 LLM 的評測，手動跑
make mutate        # 測試有沒有在測（mutation score）
uv run pytest -k <關鍵字> -x
```
一律走 `uv run`，不要先 activate venv。

## 專案級 hook（`.claude/hooks/`）
- PreToolUse：`docs/tasks/目前` 存在時，Edit／Write 只放行該票「可碰檔案」，其餘 exit 2。
- PostToolUse：改 .py 就 ruff format＋check＋mypy，紅了 exit 2。

## 這個 repo 的坑
（看檔案看不出來、踩到會很貴、下次還會再踩的，才寫在這裡）
