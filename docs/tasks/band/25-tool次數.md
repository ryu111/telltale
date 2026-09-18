# 25-tool 次數：cell 標題列多一段 ` · N tools`

- 對應 SDD 節次：§2.8「cell 標題列 tool 次數」；DESIGN §1（標題列）；使用者 2026-09-18 裁定「每一條加上呼叫 tool 的次數；只數工具節點，不含 prompt／think／reply／Agent」
- 可碰檔案：`plugins/telltale/hooks/cells.ts`、`tests/突變/25-tool次數.json`
- 相關檔案：`docs/tasks/band/00-共同規則.md`、`docs/SDD.md` §2.8（已寫好）、`tests/hooks/cells-render.test.ts`（只讀：既有標題列斷言 `✓ main 0s · hello` 必須繼續成立——那個 fixture 只有 prompt，0 tools 不顯示）
- 驗收測試：`tests/hooks/tool-count.test.ts`（新；骨架 `測試骨架/25-hooks_tool-count.test.ts.txt`，一字不改放到該路徑）
- 完成條件：`make check` 全綠；`tool-count.test.ts` 由紅轉綠；`make mutate` 本票三條全紅；既有測試不准改
- 依賴（Blocked by）：23
- 並行度：可與 24 同時（24 不碰 `cells.ts`）

## 題目
每個 cell 的標題列（v1／v4 的第 1 列、v2 框內同一段文字）在經過時間之後、` · ` 任務名稱之前，多一段 ` · N tools`。

```ts
export const TOOL_EXCLUDED = new Set(["prompt", "think", "reply", "Agent"]);
export const toolCount = (cell: Cell): number;   // steps 裡 name ∉ TOOL_EXCLUDED 的個數
```
- `headerCols` 的固定段變成：`<symbol> <label>[ <model>] <elapsed>[ · N tools] · ` 再接跑馬燈的 desc。N ≥ 1 才有那段；0 不顯示（既有 fixture 的 `✓ main 0s · hello` 不變）。tone 跟經過時間同組規則（running 時 `grey`，結束後整行 `greyDeep`）。
- 放固定段不放尾巴：尾巴是跑馬燈，會被擠掉。
- `renderMainHistory`（main 歷史合併列 `✓ N turns · …`）不加。
- I4 不變：每一列顯示寬 ≤ w（`fitLeft` 既有安全網）。

突變：
1. label `Agent counted as a tool` — `TOOL_EXCLUDED` 少了 `"Agent"`。
2. label `think counted as a tool` — `TOOL_EXCLUDED` 少了 `"think"`。
3. label `tool count never shown` — N ≥ 1 的那段永遠不加。
