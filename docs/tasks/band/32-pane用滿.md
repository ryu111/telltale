# 32-Pane 用滿、段位有感、沒列名的 sub 會收

- 對應 SDD 節次：§2.8「Pane 用滿、段位有感、沒列名的 sub 會收」（已寫好，照它做）、§1.2 規則 1／5（`cap`）、DESIGN §3；使用者 2026-09-18 真機回饋三條
- 可碰檔案：`plugins/telltale/hooks/layout.ts`、`plugins/telltale/hooks/cells.ts`、`plugins/telltale/hooks/panels/agents.ts`、`plugins/telltale/hooks/band.tsx`、`plugins/telltale/hooks/register.tsx`、`plugins/telltale/README.md`、`tests/突變/32-pane用滿.json`、`tests/突變/03-版面.json`（只准改第 1 條的 old／new）、`tests/突變/31-cell展開收合.json`（只准改第 1 條的 old／new）
- 相關檔案：`docs/tasks/band/00-共同規則.md`、`docs/tasks/band/31-cell展開收合.md`、`tests/hooks/harness.ts`（只讀）、`tests/hooks/layout.test.ts`／`stages.test.ts`／`status-row.test.tsx`／`session-scope.test.tsx`／`cells-expand.test.ts`／`agents.test.ts`（只讀：必須繼續全綠）
- 驗收測試：`tests/hooks/pane-fill.test.tsx`（新；骨架 `測試骨架/32-hooks_pane-fill.test.tsx.txt`，一字不改放到該路徑）
- 完成條件：`make check` 全綠；`pane-fill.test.tsx` 由紅轉綠；`make mutate` 全紅（本票 4 條）；既有測試不准改（撞到就回報 stuck）
- 依賴（Blocked by）：31
- 並行度：單獨跑

## 題目
三條真機回饋：右側 Pane 只畫頂端 9 列、S／C／F 只差列數看不出差別、workflow 的 sub cell 永遠 running（引擎不把它們列進 `$.agent.list()`，型別檔 `AgentLoop.agentId`：「A workflow's agents … carry ids no list names」）。

（a）**Pane 用滿**
- `layout(panels, maxRows, opts?: { status?: boolean; cap?: number })`：`cap` 預設 `BAND_ROWS_MAX`；`computeWithFixed` 的 budget 那行改成恰好 `const budget = Math.min(maxRows, cap) - fixed;`（`cap` 由 `layout` 傳進來），規則 2 的 `total` 那行同樣用 `cap`。
- `rowsForStage(stage, cap = BAND_ROWS_MAX)`：`full` 回 `{ minRows: 3, wantRows: cap - TITLE_ROWS }`；summary／compact 不變。
- `buildBandProps(active, $, maxRows, viewportColumns, placement, liveKey, only?, cap = BAND_ROWS_MAX)`：`wants` 的 `rowsForStage(stage, cap)`、`layout(wants, maxRows, { status, cap })`。
- `ui.render{Pane}` 站：`const bodyRows = e.props.scroll.bodyRows`（缺就 `BAND_ROWS_MAX`），呼叫恰好 `buildBandProps(active, $, bodyRows, viewportColumns, placement, liveKey, only, bodyRows)`。AbovePrompt 站與 `command.run` 的 status 不變。

（b）**compact 真的收**
- `cells.ts`：`isCollapsed(cell, now, expanded = null, forceCollapsed = false)`，第一行改成恰好 `if (forceCollapsed || cell.collapsed === true) return true;`；`renderCell(..., cam, expanded = null, forceCollapsed = false)` 傳給每個 `isCollapsed`；main history 分支：`forceCollapsed` 時只回合併列（不展開）。
- `band.tsx`：`buildCellRows` 依 `panel.buttons?.size === "compact"` 傳 `forceCollapsed`（`BandPanel.buttons.size` 票 24 已帶，不加新欄位）。
- `tests/突變/31-cell展開收合.json` 第 1 條：old 改成上面那行、new 改成 `if (forceCollapsed) return true;`。

（c）**沒列名的 sub 閒置就收**
- `cells.ts` `Cell` 加 `listed?: true`（`$.agent.list()` 曾列過它）。
- `panels/agents.ts`：`export const UNLISTED_IDLE_MS = 2 * 60 * 1000;`；`applyAgentList` 對 list 裡每個 `info.id` 對到的 cell（新開的、補 desc 的、狀態翻的、原樣的）都寫 `listed: true`；新 step `applyUnlistedIdle(cells, now)`（放在 `applyBgCleanup` 之後）：`kind === "sub"`、`status === "running"`、`listed !== true`、恰好 `now - cell.updatedAt > UNLISTED_IDLE_MS` → `{ ...cell, status: "completed", endAt: now, updatedAt: now, steps: [...steps, { name: "reply", t0: now }] }`。
- README：agents 段加一句：a workflow's agents are not listed by the engine, so their cells complete after two idle minutes instead of on a status change.

突變（`tests/突變/32-pane用滿.json`）：
1. label `layout: cap ignored` — file layout.ts，old `Math.min(maxRows, cap)`（恰好一次）new `Math.min(maxRows, BAND_ROWS_MAX)`。同時把 `tests/突變/03-版面.json` 第 1 條 old 改成 `Math.min(maxRows, cap)`、new 改成 `maxRows`。
2. label `pane site still capped at BAND_ROWS_MAX` — file register.tsx，old `buildBandProps(active, $, bodyRows, viewportColumns, placement, liveKey, only, bodyRows)` new `buildBandProps(active, $, bodyRows, viewportColumns, placement, liveKey, only, BAND_ROWS_MAX)`。
3. label `compact does not collapse` — file cells.ts，old `if (forceCollapsed || cell.collapsed === true) return true;` new `if (cell.collapsed === true) return true;`。
4. label `unlisted idle never completes` — file panels/agents.ts，old `now - cell.updatedAt > UNLISTED_IDLE_MS` new `false`。
