# 05-harness 與 render：假引擎、session.start、poll 迴圈、ui.render 組 Client props

- 對應 SDD 節次：§1.4、§1.5（BandProps）、§2.1、§2.4、§3 Pipeline、§4；不變量 I1、I4、I5、I7（fake 層）、I8、I10、I11
- 可碰檔案：`hooks/harness.ts` `hooks/register.tsx` `hooks/mutations.json`
- 相關檔案：`docs/SDD.md`（§1.4、§1.5、§2.1、§3、§4、§5）、`hooks/layout.ts`、`hooks/panel.ts`、`hooks/panels/index.ts`、`hooks/width.ts`、`.claude/types/claude-code.d.ts`（第 4895–4935 行 `RenderInputOf`；第 5170–5210 行 `AbovePrompt` props；第 918–960 行 `ClientProps`；第 1787–1846 行 `$.store`／`$.clock`；第 1690–1702 行 `$.command.register`；第 2160–2170 行 `ui.message`；第 3474–3480 行 `On`；第 4623–4700 行 `RenderElement`；第 6960–6990 行 `h`／`Fragment` 全域）、`docs/tasks/band/00-共同規則.md`
- 驗收測試：`hooks/register.test.tsx`
- 完成條件：`make check` 全綠；驗收測試由紅轉綠；`make mutate` 對本票四條突變全紅；code-review Spec 軸零缺漏、零超範圍
- 依賴（Blocked by）：01, 03, 04
- 並行度：單獨跑

## 題目
`hooks/harness.ts` 匯出 `fakeEngine(opts?)` 與 `clientOf(tree)`（形狀見測試）；它在 module 載入時設 `globalThis.h`／`globalThis.Fragment`（`h(tag, props, ...children)`：`tag` 是字串就回 `{ type: tag, props, children }`，是函式就呼叫它），元素表 `{ Box: "Box", Text: "Text", Client: "Client" }`。`fakeEngine` 的 `$` 只實作白名單七個 op，每呼叫一次 `calls[op]++`；`store` 走 JSON round-trip；`clock.every` 只記下 `(ms, fn)`，測試用 `tick(id)` 手動觸發；`ui.invalidate` 計數；`on(event, matcherOrHandler, handler?)` 依 event 與 matcher 存；`fire(event, e)` 呼叫對應 handler，`next(e)` 回 `NEXT`（`ui.render` 回 `NEXT_RENDER = { type: "Text", children: ["<next>"] }`，其他回 `{}`）。`fakeEngine` 回傳的欄位（測試直接讀）：`on`、`$`、`fire`、`store`（可直接讀寫的物件）、`calls`（`Record<op, number>`）、`invalidations`、`registered`（command 名清單）、`timers`（`{ ms, fn }[]`）、`tick(id)`（呼叫該面板的 tick）、`now`（可改，`$.clock.now()` 回它）、`NEXT_RENDER`。`clientOf(tree)` 回第一個 `type === "Client"` 的節點或 `null`。

`hooks/register.tsx` 改成 `export const makeRegister = (panels: readonly Panel[]): Register` 與 `export const register = makeRegister(PANELS)`，照 SDD §3：
- `session.start`：`panels` 種子（store 有就不動；缺的 id 用 `options["panel.<id>"] ?? defaultOn`）、`$.command.register({ name: "telltale", description: "Toggle panels, or show what the band is doing", argumentHint: "[status|help|on|off|<panel> [on|off]]" })`、每個有 `poll` 的面板 `tick()` 一次再 `$.clock.every(everyMs, tick)`。`tick` 照 §3（64 KiB 上限 `DATA_MAX_BYTES = 64 * 1024`、`error.<id>`、`$.ui.invalidate("ui.render")`）。
- `ui.render{AbovePrompt}`：`hasSurvey` 讓位；`layout(wants, e.props.maxRows)`；`columnsForView = Math.max(MIN_COLUMNS, e.viewport?.columns ?? 80)`；每個 slot 讀 `data.<id>`／`error.<id>` 組 `BandPanel`；回 `<Client key="band" module="Band" props={BandProps} />`（`Client` 從 `$.ui.resolve(e)` 拿）。props 裡**不准有 `undefined`**（`at`／`error` 用 `null`）。
- `ui.message`：`e.data` 是 `{ kind: "toggle", id }` 且 id 在面板表 → 翻轉 `panels[id]`、`$.store.set`、`$.ui.invalidate`；其他 data 忽略。回 `next(e)`。
- 這張票**不做** `command.run`（票 07）；`band.tsx` 維持票 01 的樣子（票 06）。

突變：
1. label `render: hasSurvey does not yield` — 拿掉讓位判斷。
2. label `render: dropped not passed to Client` — `dropped` 傳空陣列。
3. label `tick: oversized data still stored` — 拿掉 64 KiB 判斷。
4. label `toggle: store not written` — `ui.message` 翻轉後不 `$.store.set`。
