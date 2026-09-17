# 06-band：Client 畫帶子、點面板標題切換（hit.ts 純函式）

- 對應 SDD 節次：§1.5；不變量 I4（Band 那一層）、I7（真引擎，tmux）
- 可碰檔案：`hooks/band.tsx` `hooks/hit.ts` `hooks/mutations/NN-<slug>.json`（一票一檔）
- 相關檔案：`docs/SDD.md`（§1.5、§7.4 顏色三條）、`hooks/width.ts`、`hooks/layout.ts`（`MIN_COLUMNS`）、`hooks/register.tsx`（`BandProps`／`BandPanel` 型別從這裡 import type）、`.claude/types/claude-code.d.ts`（第 835–880 行 `ClientElements`／`ClientModule`；第 887–915 行 `ClientPointerEvent`；第 968–1030 行 `ClientSurface`；第 6080–6100 行 `TextProps`）、`docs/tasks/band/00-共同規則.md`
- 驗收測試：`hooks/hit.test.ts`
- 完成條件：`make check` 全綠；驗收測試由紅轉綠；`make mutate` 對本票兩條突變全紅；code-review Spec 軸零缺漏、零超範圍
- 依賴（Blocked by）：05
- 並行度：可與 07 同時（碰的檔案不交集）

## 題目
`hooks/hit.ts`（純函式，不 import `claude-code`）匯出：
- `TITLE_RESERVE = 4`（= 引擎 `[-]` 蓋掉的 3 欄 + 1 欄緩衝，兩個數字都寫成常數並註解）。
- `rowsOf(props: BandProps): Record<string, number>` — 每個面板**標題列**的 y（第 0 列是帶子標題，之後每面板 1 列標題 + `rows` 列內容，最後一列狀態）。
- `hitPanel(y, x, props, columns): string | null` — `props.total > 1`、`columns ≥ MIN_COLUMNS`、`x < columns - TITLE_RESERVE`、`y` 是某面板標題列 → 該 id；否則 `null`。
- `isClick(down: {x,y} | null, ev: { type, x, y }): boolean` — `down` 非空、`ev.type === "up"`、同一格。

`hooks/band.tsx` 的 `Band(props: BandProps, surface: ClientSurface<BandState>)` 照 SDD §1.5 畫：`columns = surface.columns || props.columnsHint`；窄於 `MIN_COLUMNS` 或 `props.total === 1` 的單列降級；全關時的那一列；標題列 `fit(…, columns - TITLE_RESERVE)`；面板標題 `─ label ─…` 補滿；每行 `fit(text, columns)`；狀態列（dropped ＞ error ＞ `updated Ns ago`）；tone → 色（up 綠、down 紅、flat 無、dim `dimColor`）；**每次呼叫都** `surface.onPointer`，回呼裡用 `surface.state`／`setState` 記 `down`，`isClick` 成立且 `hitPanel(...)` 非 null 就 `surface.post({ kind: "toggle", id })`。列的位置一律用 `rowsOf`，不許另算一份。

突變：
1. label `hit: dead zone ignored` — 拿掉 `x < columns - TITLE_RESERVE`。
2. label `hit: title rows off by one` — `rowsOf` 少算面板標題那一列。

## 出題者的手動實測（merge 後由主 agent 做；I7 與 DoD #3 只認這個）
tmux 150×34 開起來看到兩個面板；SGR 點 clock 的標題列 → clock 消失、hello 的內容不變、`/tmp/tt.log` 裡 `hooks module telltale loaded` 只有一行；點最右 4 欄不觸發；點 hello 標題列 → 剩 `all panels off` 一列。
