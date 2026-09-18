# 26-session 隔離：headless 整個不動；live 資料按 session 分鍵；tick 成功要清 error

- 對應 SDD 節次：§2.8「session 隔離」、§2.1（`agents.cells.<sid>`／`agents.expanded.<sid>`／`error.agents.<sid>`）、§5 I12（`calls:` 多 `$.session.id`、`$.store.keys`、`$.store.delete`）；使用者 2026-09-18 裁定：headless 整個不動；別的 session 的 cell 混進來會看錯
- 可碰檔案：`plugins/telltale/hooks/register.tsx`、`plugins/telltale/README.md`、`tests/突變/26-session隔離.json`
- 相關檔案：`docs/tasks/band/00-共同規則.md`、`docs/SDD.md` §2.8（已寫好）、`.claude/types/claude-code.d.ts` 的 `SessionStartInput`（`grep -n "export type SessionStartInput"` 後讀 16 行：`isInteractive: boolean`）與 `$.session.id`／`$.store.keys`／`$.store.delete`（`grep -n "id: () => Promise<string>"`、`keys: () => Promise<string\[\]>`、`delete: (key: string)`）、`tests/hooks/harness.ts`（只讀：`sessionId` 選項、`$.session.id()`、`store.keys`／`delete`、`opened`）
- 驗收測試：`tests/hooks/headless.test.tsx`（新）＋ 既有 `agents.test.ts`、`agents-command.test.ts`、`empty-stub.test.ts`、`observe.test.tsx`、`session-scope.test.tsx`、`buttons.test.tsx`、`register.test.tsx`、`tests/單元/test_validate.py`、`tests/單元/test_readme_v02.py` 的改版——全部在 `測試骨架/26-*.txt`，一字不改覆蓋到對應路徑（骨架檔名 `26-hooks_<name>.txt` → `tests/hooks/<name>`；`26-tests_單元_<name>.py.txt` → `tests/單元/<name>.py`）
- 完成條件：`make check` 全綠；`headless.test.tsx` 由紅轉綠；`make mutate` 本票三條全紅；`claude plugin validate --strict plugins/telltale` 的 `calls:` 恰好是 README 貼的那行
- 依賴（Blocked by）：24、25
- 並行度：單獨跑

## 題目
真機：Claude Desktop 開的 4 個 headless（stream-json）session 也載入了 plugin，每秒 `$.agent.list` 失敗（`not available in this mode: no session is bound`）寫進**共用**的 store，終端機那條帶子讀到就在狀態列顯示；它們的 turn.step 也把自己的 cell 寫進同一個 `agents.cells`，終端機看到別的 session 的任務。三件事：

### 1. headless 整個不動
`session.start` 讀 `e.isInteractive`；`=== false` 時設 module 變數 `headless = true`，**只做** `$.command.register`（讓 `/telltale` 不會變成未知指令），然後 `return next(e)`：不寫 `panels`、不清 cells、不 `$.ui.open`、不註冊 tick。其餘每個 hook 開頭 `if (headless) return next(e)`（`ui.render` 兩個 site 也是 `next(e)`；`command.run` 回 `{ text: "telltale: idle (headless session)" }`）。`isInteractive` 缺（舊 harness、`{}`）視為互動。

### 2. live 資料按 session 分鍵
- `session.start`（互動）先 `sid = await $.session.id()` 存進 module 變數；三個鍵改成 `agents.cells.${sid}`、`agents.expanded.${sid}`、`error.agents.${sid}`（用一個 `liveKey(base)` helper，`register.tsx` 裡所有讀寫都走它；`error.<id>` 對 agents 以外的面板不變）。`anyPanelErroring` 讀 agents 時也用分鍵。
- 清舊：`session.start` `$.store.keys()` 找 `agents.cells.<other>`（other ≠ sid）；其值為空物件、或所有 cell 的 `updatedAt` 最大值 `< now − STALE_SESSION_MS`（`export const STALE_SESSION_MS = 24 * 60 * 60 * 1000`）就 `$.store.delete` 它與 `agents.expanded.<other>`、`error.agents.<other>`；否則不動（別人可能還活著）。自己的 `agents.cells.${sid}` 照票 21 設 `{}`。
- `command.run` 的 `agentsView.cells` 與 `agents clear` 的寫回、`ui.message` row／clear、觀察型 hook 全部走分鍵。

### 3. tick 成功要清 error
agents 分支成功寫完 cells 後 `await $.store.set(liveKey("error.agents"), "")`（舊碼只在 catch 寫、成功不清，一次失敗就永遠顯示狀態列）。

### README
- `validate` 輸出區塊重貼（`calls:` 多 `$.session.id`、`$.store.delete`、`$.store.keys`，字母序照 validate 印的）。
- 「Why `$.ui.open` shows up」那段後加一段：`$.session.id` is read once so each session keeps its own cells (the store file is shared by every session of the same plugin); `$.store.keys`/`delete` only ever touch telltale's own `agents.*` keys, to drop cells left by sessions that ended more than a day ago. Headless sessions (`-p`, the SDK, Claude Desktop) leave the store alone entirely.

突變：
1. label `headless session still runs` — `e.isInteractive === false` 的判斷拿掉（永遠當互動）。
2. label `agents tick success does not clear the error` — 成功路徑那行 `set(..., "")` 拿掉。
3. label `cells not keyed by session` — `liveKey` 回 `base` 不加 sid。
