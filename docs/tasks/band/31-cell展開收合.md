# 31-cell 展開／收合真的畫：點擊存下的狀態要改變 renderCell 的輸出

- 對應 SDD 節次：§2.8「cell 展開／收合真的畫」（已寫好，照它做）、§2.6 onRow、DESIGN §3「點 cell 標題：展開／收合」；使用者 2026-09-18 真機回饋「拉伸（展開／收合）沒有做」
- 可碰檔案：`plugins/telltale/hooks/cells.ts`、`plugins/telltale/hooks/panels/agents.ts`（只准把 `EXPANDED_MS` 改成從 cells.ts import 並 re-export）、`plugins/telltale/hooks/band.tsx`、`plugins/telltale/hooks/register.tsx`（只准動 `buildBandProps` 的 agents 分支）、`tests/突變/31-cell展開收合.json`
- 相關檔案：`docs/tasks/band/00-共同規則.md`、`docs/tasks/band/17-agents指令與點擊.md`、`tests/hooks/harness.ts`（只讀）、`tests/hooks/cells.test.ts`／`cells-render.test.ts`／`agents-command.test.ts`（只讀：必須繼續全綠）
- 驗收測試：`tests/hooks/cells-expand.test.ts`（新；骨架 `測試骨架/31-hooks_cells-expand.test.ts.txt`，一字不改放到該路徑）
- 完成條件：`make check` 全綠；`cells-expand.test.ts` 由紅轉綠；`make mutate` 本票四條全紅；既有測試不准改（撞到就回報 stuck）
- 依賴（Blocked by）：30
- 並行度：單獨跑

## 題目
票 17 的 `onRow` 把點擊結果寫進 `cell.collapsed` 與 `agents.expanded.<sid>`，但 `renderCell` 只看時間（`isCollapsed` = completed 且過 `COLLAPSE_AFTER_MS`），`band.tsx` 也沒拿到 `expanded`。真機上點 cell 什麼都不會變。改成：

- `cells.ts`：
  - `export const EXPANDED_MS = 10_000;` 搬進來（`panels/agents.ts` 改 `import { EXPANDED_MS } from "../cells"` 並 `export { EXPANDED_MS }`，`isExpanded` 不動）；`export const MAIN_HISTORY_EXPAND = 3;`；`export type Expanded = { id: string; at: number } | null;`。
  - `isCollapsed(cell, now, expanded: Expanded = null)`，恰好這三行：
    ```ts
    if (cell.collapsed === true) return true;
    if (cell.status !== "completed" || cell.endAt === undefined || now - cell.endAt <= COLLAPSE_AFTER_MS) return false;
    return !(expanded !== null && expanded.id === cell.id && now - expanded.at < EXPANDED_MS);
    ```
  - `renderCell(cell, style, w, h, now, frame, cam, expanded: Expanded = null)`：把 `expanded` 傳進 `renderV1`、`renderV2Layout`、v4 分支的每一個 `isCollapsed` 呼叫。
  - main history 分支：`expanded` 指到 `MAIN_HISTORY_ID` 且沒過期 → 第 1 列照舊 `renderMainHistory(...)`，接著 `steps` 裡 `name === "turn"` 的最後 `MAIN_HISTORY_EXPAND` 條（`turns.slice(-MAIN_HISTORY_EXPAND)`，舊到新）各一列 `  ✓ <formatElapsed(t1 - t0)> <detail>`（tone `grey`，`fit` 到 w），整體 `slice(0, h)`；沒展開或過期 → 只有那一列（現況）。三種 style 一樣。
- `band.tsx`：`CellsPanel` 加 `expanded?: Expanded`，`cellsOf` 帶出來，`buildCellRows` 呼叫 `renderCell(..., cam, cellsPanel.expanded ?? null)`。
- `register.tsx` `buildBandProps` agents 分支：讀 `liveKey("agents.expanded")`，spread 改成 `{ cells: view.cells, style, expanded }`，`expanded` 沒存時是 `null`（不能是 `undefined`，引擎拒繪）。
- 點擊之後的到期收合不需要新時鐘：Client 的 1000 ms 幀時鐘每秒重畫，`isCollapsed` 用 `now` 自己判斷。

突變（`tests/突變/31-cell展開收合.json`）：
1. label `user collapse ignored` — old `if (cell.collapsed === true) return true;` new `if (cell.collapsed === true) return false;`
2. label `expanded never reopens` — old `return !(expanded !== null && expanded.id === cell.id && now - expanded.at < EXPANDED_MS);` new `return true;`
3. label `main history expands to nothing` — old `export const MAIN_HISTORY_EXPAND = 3;` new `export const MAIN_HISTORY_EXPAND = 0;`
4. label `expanded not passed to the Client` — file register.tsx，old `{ cells: view.cells, style, expanded }` new `{ cells: view.cells, style, expanded: null }`
