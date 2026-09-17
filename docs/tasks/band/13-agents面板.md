# 13-agents 面板：poll 生命週期、model 配對、main 歷史合併、`TELLTALE_DEV` 決定 `PANELS`

- 對應 SDD 節次：§0.1、§1.1a（`PanelIo`）、§2.1（v0.2 追加的鍵）、§2.6（「poll」「model 對回去」「背景任務」的清理部分、「主迴圈」段的「main 歷史」）、§2.7、§5 I12（子集）／I16
- 可碰檔案：`plugins/telltale/hooks/panels/agents.ts`（新）、`plugins/telltale/hooks/panels/index.ts`、`plugins/telltale/hooks/register.tsx`、`plugins/telltale/hooks/panel.ts`、`plugins/telltale/.claude-plugin/plugin.json`、`tests/突變/13-agents面板.json`
- 相關檔案：
  - `docs/SDD.md`（§1.1a、§2.1、§2.6、§2.6a、§2.7）
  - `hooks/observe.ts`（票 12：`PendingSpawn` 型別、`NOTIFICATION_RE`、`takePending()`）
  - `hooks/panel.ts`（現況：`Panel<D>`／`PanelIo`；本票要擴充，見下）
  - `.claude/types/claude-code.d.ts`：`AgentInfo`（88–160 行，`id`／`description`／`type`／`status`／`parentId?`／`spawnedBy?`／`name?`）、`env.get`（2805–2820 行，異步、名字要字面值）、`agent.list`（2568–2572 行，異步、無參數）
  - `docs/tasks/band/00-共同規則.md`
- 驗收測試：`hooks/agents.test.ts`
- 完成條件：`make check` 全綠；驗收測試由紅轉綠；`make mutate` 對本票四條突變全紅；code-review Spec 軸零缺漏、零超範圍
- 依賴（Blocked by）：12
- 並行度：單獨跑（16、17 依賴它）

## 題目

### 本票對 SDD 的兩個必要澄清（回報，不是自由發揮）

1. **`PanelIo` 要加 `cells: () => Promise<Record<string, Cell>>` 與 `takePending: () => PendingSpawn[]`**（只給 `needsAgents` 的面板）。SDD §1.1a 的 code block 只寫了 `agents?: () => Promise<AgentInfo[]>`，但 poll 要對照「目前的 `agents.cells`」做 diff、要拿票 12 攢的 `pendingSpawns` 來配對，沒有別的管道能讀——`poll(io): Promise<D>` 是純函式簽名，`D` 是要被 `$.store.set` 覆蓋掉的新值，不能拿它讀舊值。這兩個欄位加進 `hooks/panel.ts` 的 `PanelIo`（`agents`／`cells`／`takePending` 都只在 `needsAgents: true` 時由框架注入，其餘面板拿 `undefined`）。
2. **agents 面板的 poll 結果不寫 `data.agents`，寫 `agents.cells`**（§2.1 表：「`agents.cells` | ... | poll 與各觀察型 hook」寫）。`register.tsx` 的 session.start 通用 tick 迴圈（票 05）目前一律 `$.store.set(\`data.${id}\`, …)`；本票把它改成：`p.id === "agents"` 時 `$.store.set("agents.cells", data)`，其餘面板不變。**這是本票唯一准動的一行分支**，不要把 64 KiB／`error.<id>` 那套邏輯也複製一份給 agents（agents 面板不用 `error.<id>`，poll 失敗就照原樣拋，通用 tick 的 try/catch 已經接住）。

### `hooks/panels/agents.ts`

```ts
export const MAIN_HISTORY_ID = "main-history";

export const agents: Panel<Record<string, Cell>> = {
  id: "agents", label: "agents", defaultOn: true,
  minRows: 3, wantRows: CONTENT_ROWS_MAX,   // stages 存在時 layout 用 stages 算，這兩個是沒有 stages 支援時的後備值
  needsAgents: true,
  stages: { summary: 0, compact: 3, full: "rest" },
  everyMs: 1000,
  poll: async (io) => { … },
  view: (cells, columns, rows) => ({ id: "agents", kind: "cells", cells: sortCells(Object.values(cells ?? {})) }),
};
```

`poll(io)` 的步驟（§2.6「poll」「model 對回去」「背景任務」清理部分、「主迴圈」的「main 歷史」）：

1. `let cells = await io.cells();`（框架保證非 `undefined`，第一次是 `{}`）；`const list = await io.agents();`；`const now = await io.now();`。
2. **sub 生命週期**：`list` 裡每個 `AgentInfo`：`cells[id]` 不存在 → 開新 `kind:"sub"` cell（`firstAt: now`、`desc: description`、`steps: [{name:"prompt", t0: now}]`、`status:"running"`）；已存在且 `status` 從 running 變成別的 → `endAt: now`、`updatedAt: now`、`status` 對應改（`completed`／`failed`／`killed`；其餘值原樣塞進 `status`）、`completed` 才 push `{name:"reply", t0: now}`，`failed`／`killed` push `{name: status, t0: now}`（節點名就是狀態字，符號表交給票 10／14）。**已存在且 `turn.step`（票 12）已經先建了最小 stub（`desc:""`）**：這裡用 `list` 的 `description` 補上 `desc`（stub 不會被誤判成新 cell，用同一個 `id`）。
3. **model 對回去**：`const pending = io.takePending();` 每筆用 `description` 對照本輪新開的 sub cell（`cells[id].model === undefined && cells[id].desc === pending[i].description`），**取 `pending` 裡最早的一筆**（`at` 最小）、用過就從陣列移除，不重複用；配不到的 pending 留到下一秒繼續嘗試（不是本輪就丟）。同名兩筆以上時哪個 sub cell 配到哪個 pending 不保證（SDD 已知限制），但每筆 pending 最多只被消耗一次。
4. **`kind==="bg"` 的清理**：`status:"running"` 且 `now - firstAt > LONG_RUN_MS`（久跑，只變黃，`status` 不變，視覺層票 14 自己看 `firstAt` 算，這裡不用管）；`now - firstAt > ORPHAN_MS` 且沒被 `applyTaskNotification` 關掉（沒有 `endAt`）→ `status: "orphan"`。
5. **60 秒清除**：`kind !== "main"` 或 `id !== MAIN_HISTORY_ID` 的 cell，`status === "completed"` 且 `now - endAt >= VANISH_AFTER_MS`（票 10 常數，本票先本地 `60_000` 同值）→ 刪除。`failed`／`killed`／`orphan` 不刪（留到 `dismissed`）。
6. **main 歷史合併**（`COLLAPSE_AFTER_MS = 3_000`，不是 60 秒）：`kind === "main"`、`status === "completed"`、`now - (endAt ?? updatedAt) >= COLLAPSE_AFTER_MS` 的 cell（真正的 turn cell，`id` 是 turnId，不是 `MAIN_HISTORY_ID`）→ 從 `cells` 刪掉，把它折進 `cells[MAIN_HISTORY_ID]`（不存在就新建：`kind:"main"`、`label:"main"`、`status:"completed"`）：`desc` 換成這個 turn 的 `desc`（永遠是「最近一輪」）、`endAt`／`updatedAt` 設 `now`、`firstAt` 保留歷史 cell 原本的（第一次建立時 = 這個 turn 的 `firstAt`）、`steps` push 一筆 `{ name: "turn", detail: 這個turn的desc, t0: 這個turn的firstAt, t1: 這個turn的endAt }`（超過 `STEPS_MAX` 用既有的「最舊合併成 `… ×N`」規則，票 10 就位後從那裡 import；本票先各自複製一份最小版本，等票 10 落地再收斂成 import，回報這個技術債）。`MAIN_HISTORY_ID` cell 本身**不受規則 5 的 60 秒清除影響**（它是滾動彙總，不是單一 instance）。**running 的 main cell 永遠不折**（規則 5／6 都只看 `status === "completed"`）。
7. 回傳最終 `cells`（框架寫回 `agents.cells`）。

### `hooks/panels/index.ts`／`register.tsx`：`TELLTALE_DEV`

`PANELS` 改成 `[agents, hello, clock]`（agents 面板不需要環境變數就能用；hello／clock 是開發用）。`register.tsx` 的 `session.start` 讀一次 `const dev = await $.env.get("TELLTALE_DEV");`，算出 `const active = panels.filter((p) => !DEV_ONLY_PANEL_IDS.has(p.id) || dev === "1");`（`DEV_ONLY_PANEL_IDS = new Set(["hello", "clock"])`，這個常數定義在 `register.tsx` 裡，不改 `panel.ts` 的 `Panel<D>` 型別——面板本身不知道自己是不是「開發限定」，這是框架的政策，不是面板的資料）。`active` 存進 `registerHooks` 這次呼叫的閉包變數，後續所有 hook（`ui.render`、`ui.message`、`command.run`、票 12 的五個觀察 hook 不需要 `active`——它們只碰 `agents.cells`，跟面板開關無關）改用 `active` 取代原本直接用參數 `panels`。**`$` 只在 hook 內存在，`session.start` 之前無法讀 `$.env.get`**（SDD §2.7「`register` 時讀」是不精確的講法，以本票這個「`session.start` 內讀、閉包變數快取」為準，回報這個 SDD 用詞落差）。

`.claude-plugin/plugin.json` 的 `userConfig` 整段刪掉（`panel_hello`／`panel_clock` 都不留，§2.7：沒有公開面板需要種子）。`session.start` 原本讀 `options["panel_<id>"]` 當種子的邏輯留著（`options` 現在永遠讀不到那兩個鍵，退回 `p.defaultOn`，行為不變、只是死碼——不用特別砍，砍了要動到 05 的邏輯，超出本票範圍）。

## 突變

1. label `agents poll: sub status change does not push reply` — 拿掉「status 從 running 變成 completed → push reply」那段判斷。
2. label `agents poll: vanish uses collapse constant` — 把規則 5 的 `VANISH_AFTER_MS` 換成 `COLLAPSE_AFTER_MS`（讓完成的 cell 3 秒就消失，不是 60 秒）。
3. label `model pairing: reuses a consumed pending spawn` — 拿掉「用過就從陣列移除」那行，讓同一筆 pending 可以配兩次。
4. label `TELLTALE_DEV: dev-only panels always active` — `DEV_ONLY_PANEL_IDS.has(p.id) || dev === "1"` 的 `!` 拿掉（條件永遠真）。

## 已知落差（回報）

- `STEPS_MAX` 壓縮（「`… ×N`」）本票暫時各自複製一份最小實作（只在 main 歷史合併與一般 cell 的 steps 超過 64 時觸發），等票 10 的 `hooks/cells.ts` 落地後應該改成從那裡 import 同一份，現在是兩份平行邏輯，技術債。
- `calls:` 本票只驗**子集**（七個＋`$.agent.list`＋`$.env.get`＋`$.ui.open`＋`$.ui.close`，本票用不到後兩個，不驗它們有沒有出現）；`calls:` **恰好**的收斂測試留給票 16（它接上 `$.ui.open`／`$.ui.close`）。
