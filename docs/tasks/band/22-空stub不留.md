# 22-空stub不留：從沒拿到 description 的 sub stub，結束時直接丟掉

- 對應 SDD 節次：§2.6（sub cell 生命週期）、§2.6a；DESIGN §1（標題＝狀態符號＋名字＋任務名稱）；2026-09-18 主 agent 票 21 後的 tmux 實測（見「題目」）
- 可碰檔案：`plugins/telltale/hooks/panels/agents.ts`、`tests/突變/22-空stub不留.json`
- 相關檔案：`docs/tasks/band/00-共同規則.md`、`plugins/telltale/hooks/observe.ts`（只讀 `applyTurnStep` 開 stub 那段）
- 驗收測試：`tests/hooks/empty-stub.test.ts`
- 完成條件：`make check` 全綠；驗收測試由紅轉綠；`make mutate` 本票一條全紅；既有測試不准改（撞到就回報 stuck）
- 依賴（Blocked by）：21
- 並行度：單獨跑

## 題目
票 21 merge 後真機再測（派一個會被 backgrounded 的 Explore subagent）：`✓ sub 0s · `（label `sub`、desc 空、0 秒）還在。來源不是 poll 開新 cell（票 21 已堵），而是：
1. `applyTurnStep` 收到帶 `agentId` 的 step，`agent.list` 還沒看到它 → 開一個 desc 為 `""` 的 stub（這條保留，是設計）。
2. 下一個 poll 的 `agent.list` 給的那筆 `description` 仍是 `""`、`status` 已不是 running（backgrounded 的 handback 會這樣）→ `applyAgentList` 走「existing → 補 desc → 關 cell」，關出一個 0 秒的空 cell。

要改的規則（只在 `applyAgentList`）：**existing stub 的 desc 是 `""`、`agent.list` 那筆的 description 也是 `""`、而且它的 status 不是 running → 把這個 cell 從 cells 刪掉**，不關、不留。有 description 的照舊補上再關。running 中的空 stub照舊保留（等下一個 poll 補 desc）。

突變：
1. label `empty stub is closed instead of dropped` — 把「刪掉」改回「照舊補 desc 後關 cell」。
