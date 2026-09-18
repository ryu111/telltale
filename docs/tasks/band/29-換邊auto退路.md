# 29-換邊 auto 退路：edge 沒存時 Pane 沒畫就由 AbovePrompt 畫，Pane 一來就讓位

- 對應 SDD 節次：§2.8「換邊 auto 退路」（已寫好，照它做）、§1.6（`agents edge auto`）；使用者 2026-09-18 裁定
- 可碰檔案：`plugins/telltale/hooks/register.tsx`、`plugins/telltale/hooks/command.ts`、`plugins/telltale/README.md`、`tests/突變/29-換邊auto退路.json`
- 相關檔案：`docs/tasks/band/00-共同規則.md`、`docs/tasks/band/27-換邊三態.md`（語意表）、`tests/hooks/harness.ts`（只讀）、`tests/hooks/edge.test.tsx`（只讀：必須繼續全綠）
- 驗收測試：`tests/hooks/edge-auto.test.tsx`（新；骨架 `測試骨架/29-hooks_edge-auto.test.tsx.txt`，一字不改放到該路徑）
- 完成條件：`make check` 全綠；`edge-auto.test.tsx` 由紅轉綠；`make mutate` 本票三條全紅；既有測試不准改（撞到就回報 stuck）
- 依賴（Blocked by）：28
- 並行度：單獨跑

## 題目
真機（cmux 內的 claude）：Pane 的 `ui.render` 從來不來，`edge` 沒存＝`right` 讓 AbovePrompt 讓位 → 整條帶子消失。改成：

- module 變數 `let paneSeen = false`；`ui.render{Pane}` hook 每次被叫到（且不是 headless、edge 不是 bottom）就 `paneSeen = true`；第一次從 false 變 true 時 `$.ui.invalidate("ui.render")`（讓 AbovePrompt 重畫成讓位）。
- 生效 edge：`effectiveEdge(stored, paneSeen)`（純函式，放 `command.ts` 並 export）：`stored` 是 `right|bottom|both` 就回它；沒存或 `"auto"` → `paneSeen ? "right" : "bottom"`。`session.start`、兩個 render site、`command.run` 的 open/close 決定都用生效值（session.start 時 `paneSeen` 一定 false，但 auto 仍要 `$.ui.open`——open 的條件是「stored 不是 bottom」，跟票 27 一樣）。
- `AgentsView.edge` 型別加 `"auto"`；`agents edge` 沒存回 `agents edge: auto`；`agents edge auto` 合法、寫 `"auto"`；`agentsSet` 的 from 是 stored 值（沒存＝`auto`）。
- `buttons.edge` = 生效值。
- README：`edge` 段加一句：with nothing stored telltale asks for the Pane but keeps drawing above the prompt until the Pane actually renders (some hosts never do), then yields; set `right` explicitly to force Pane-only.

突變：
1. label `auto never falls back above the prompt` — 沒存時 AbovePrompt 仍讓位（`effectiveEdge` 對 auto 永遠回 right）。
2. label `pane render never marks paneSeen` — Pane hook 不設 `paneSeen`。
3. label `explicit right also falls back` — 明存 `right` 也走 `paneSeen ? right : bottom`。
