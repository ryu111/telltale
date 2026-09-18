# 30-right 也走退路：明存 right 時 Pane 沒畫就照樣由 AbovePrompt 畫

- 對應 SDD 節次：§2.8「換邊 auto 退路」（已改成 right 也走退路，照它做）；使用者 2026-09-18 裁定（真機：cmux 上點 `R` 整條帶子消失、也沒地方按回來）
- 可碰檔案：`plugins/telltale/hooks/command.ts`、`plugins/telltale/hooks/register.tsx`（只准改註解）、`plugins/telltale/README.md`、`tests/突變/30-right也走退路.json`、`tests/突變/29-換邊auto退路.json`（只准刪第 3 條）
- 相關檔案：`docs/tasks/band/00-共同規則.md`、`docs/tasks/band/29-換邊auto退路.md`、`tests/hooks/harness.ts`（只讀）
- 驗收測試：`tests/hooks/edge-auto.test.tsx` 與 `tests/hooks/edge.test.tsx`（兩份都由骨架 `測試骨架/30-hooks_edge-auto.test.tsx.txt`、`30-hooks_edge.test.tsx.txt` 整檔覆蓋，一字不改；這兩份是既有測試的新版，票 30 明准覆蓋）
- 完成條件：`make check` 全綠；`edge-auto.test.tsx` 由紅轉綠；`make mutate` 全紅（本票 1 條＋票 29 剩 2 條）；其餘既有測試不准改（撞到就回報 stuck）
- 依賴（Blocked by）：29
- 並行度：單獨跑

## 題目
票 29 讓「沒存／auto」在 Pane 沒畫時退回 AbovePrompt，但明存 `right` 仍強制只 Pane。真機：cmux 從不畫 Pane，點標題列 `R`（寫 `right`）整條帶子就消失，而按鍵跟著消失、沒地方按回來。改成：

- `effectiveEdge(stored, paneSeen)`：`bottom`、`both` 照回；**其餘（`right`、`auto`、沒存）一律 `paneSeen ? "right" : "bottom"`**。實作恰好是這兩行：
  ```ts
  if (stored === "bottom" || stored === "both") return stored;
  return paneSeen ? "right" : "bottom";
  ```
- `right` 與 `auto` 的差別只剩「有沒有明存」：`session.start` 兩者都 `$.ui.open`；`agents edge` 回報字串照舊（`right` 回 `right`、沒存回 `auto`）；`buttons.edge` 仍是生效值。
- `register.tsx` 不改邏輯，只把 Pane hook 與 AbovePrompt hook 上「an explicit value wins outright」那類註解改成對的。
- README `edge` 段：把「Set `right` explicitly to force `Pane`-only up front（… that's a choice you made, not a fallback）」那兩句改成：`right` and `auto` differ only in whether the value is stored — both fall back above the prompt until the `Pane` renders; the only way to have no band is `bottom` on a host with no AbovePrompt, or turning the panel off.
- `tests/突變/29-換邊auto退路.json`：刪掉第 3 條（`explicit right also falls back`，它現在是正確行為）。

突變（`tests/突變/30-right也走退路.json`）：
1. label `explicit right never falls back` — old 是上面第一行 `if (stored === "bottom" || stored === "both") return stored;`，new 把 `"right"` 加回去（`if (stored === "right" || stored === "bottom" || stored === "both") return stored;`）。
