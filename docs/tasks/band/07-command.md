# 07-command：/telltale（純解析＋格式化 + command.run hook）

- 對應 SDD 節次：§1.6；§3 的 `command.run` 分支
- 可碰檔案：`hooks/command.ts` `hooks/register.tsx` `hooks/mutations.json`
- 相關檔案：`docs/SDD.md`（§1.6、§3）、`hooks/harness.ts`（測試用的假引擎，唯讀）、`hooks/layout.ts`、`.claude/types/claude-code.d.ts`（第 1156–1215 行 `CommandRunInput`／`CommandRunResult`）、`docs/tasks/band/00-共同規則.md`
- 驗收測試：`hooks/command.test.ts`
- 完成條件：`make check` 全綠；驗收測試由紅轉綠；`make mutate` 對本票兩條突變全紅；code-review Spec 軸零缺漏、零超範圍
- 依賴（Blocked by）：05
- 並行度：可與 06 同時（碰的檔案不交集）

## 題目
`hooks/command.ts`（純函式，不 import `claude-code`）匯出 `runTelltale(args: string, state: TelltaleState): { text: string; panels: Record<string, boolean> }`，`TelltaleState = { order: { id: string; label: string }[]; panels: Record<string, boolean>; layout: { slots: { id: string; rows: number }[]; dropped: string[]; total: number }; available: number }`。輸出照 SDD §1.6 表（status／`<id>`／`<id> on|off`／`on`／`off`／`help`／壞語法／未知 id）；`panels` 是套用後的開關（status／help／錯誤時原樣回傳）。空白切 token，大小寫敏感。

`hooks/register.tsx` 加 `on("command.run", { command: "telltale" }, …)`：讀 store 的 `panels`、用 `layout(...)` 算目前狀態、呼叫 `runTelltale`、`panels` 有變就 `$.store.set` + `$.ui.invalidate`，回 `{ text }`（不呼叫 `next`）。

突變：
1. label `command: unknown id is fuzzy-matched` — 未知 id 時挑最像的面板而不是報錯。
2. label `command: set on when already on reports a change` — `unchanged` 分支拿掉。
