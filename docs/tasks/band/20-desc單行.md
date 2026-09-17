# 20-desc單行：main cell 的任務名稱一律單行、通知輪要看得出來

- 對應 SDD 節次：§2.6a（`prompt` 節點來自 `turn.start`）、DESIGN §1「任務名稱」；票 17 實測（`docs/實測/agents.md` item 1 真資料）看到的兩個問題
- 可碰檔案：`plugins/telltale/hooks/observe.ts`、`tests/突變/20-desc單行.json`
- 相關檔案：`docs/tasks/band/00-共同規則.md`、`docs/實測/agents.md`（item 1 真資料那段）、`plugins/telltale/hooks/observe.ts`（`applyTurnStart`、`descOf`）
- 驗收測試：`tests/hooks/observe-desc.test.tsx`
- 完成條件：`make check` 全綠；驗收測試由紅轉綠；`make mutate` 本票兩條全紅
- 依賴（Blocked by）：17
- 並行度：可與 18 同時（檔案不交集）

## 題目
實測看到 `✓ main 5m55 · <task-notification>` 然後下一列是 `<task-id>aa56…</task-id>`：`turn.start.text` 是多行、且是引擎送進來的通知不是人打的 prompt。`applyTurnStart` 的 `desc` 改成 `descOfTurn(text)`（export，純函式）：
1. 取**第一個非空白行**，去掉控制字元（`\n`、`\t`、`\r` 等 U+0000–U+001F），再 `slice(0, 60)`。任何輸出都不含換行。
2. text 以 `<task-notification>` 開頭：desc 是 `↩ task-notification <task-id 的值>`（用 regex `<task-id>([^<]+)</task-id>` 抓；抓不到就 `↩ task-notification`）。以 `<scheduled-trigger>`／`<peer-message>` 這類 `<xxx>` 標籤開頭的通用規則：`↩ <標籤名>`。
3. 其他不變。

突變：
1. label `descOfTurn: newlines kept` — 拿掉去控制字元那步（old 抄實作那行）。
2. label `descOfTurn: notification not recognised` — 拿掉 `<task-notification>` 分支。
