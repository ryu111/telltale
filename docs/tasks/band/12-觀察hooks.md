# 12-觀察hooks：`turn.*`／`ui.render{Spinner}`／`session.receive{task-notification}` 寫 `agents.cells`

- 對應 SDD 節次：§0.1（`turn.step` 型別衝突，見下）、§1.1a（`Cell`／`Step`）、§2.6（「主迴圈」「背景任務」兩段的觀察部分；「model 對回去」段落的 `pendingSpawns` 只記，不對）、§2.6a、§3 v0.2 pipeline 第一段、§5 I12／I13／I17
- 可碰檔案：`plugins/telltale/hooks/observe.ts`（新）、`plugins/telltale/hooks/register.tsx`、`tests/hooks/harness.ts`（測試基礎設施，本票擴充：見「harness 擴充」）、`tests/突變/12-觀察hooks.json`
- 相關檔案：
  - `docs/SDD.md`（§0.1、§1.1a、§2.6、§2.6a、§3、§5 I12/I13/I17）
  - `.claude/types/claude-code.d.ts`：`TurnStartInput`（8812–8826 行）、`TurnStepInput`（8867–8891 行，**注意：這裡沒有 `toolUses`**）、`TurnStepResult`（8927–8954 行，`toolUses` 在這裡）、`TurnCompleteFields`／`TurnCompleteInput`（8716–8762 行，`agentId?` 判斷 main／sub）、`SessionReceiveInput`／`SessionReceiveOrigin`（7548–7581 行，`origin` 是 `{ kind }` 物件不是字串）、`RenderInputOf`（6538–6569 行，`requestId` 的文件：「the agent id for a spinner」——main 迴圈時這個值是什麼未知，票 16 實測）、`Matcher`（4214–4230 行，物件可當 partial 巢狀比對，`{ origin: { kind: "task-notification" } }` 合法）、`AgentInfo`（88–160 行）
  - `hooks/panel.ts`（`Cell`／`Step` 型別；假設票 10／11 已依 SDD §1.1a 放在這裡——若放別處，以 SDD 為準並回報）
  - `hooks/register.tsx`（現況：`registerHooks(panels, on, options)`）
  - `docs/tasks/band/00-共同規則.md`
- 驗收測試：`hooks/observe.test.tsx`
- 完成條件：`make check` 全綠；驗收測試由紅轉綠；`make mutate` 對本票四條突變全紅；code-review Spec 軸零缺漏、零超範圍
- 依賴（Blocked by）：11
- 並行度：單獨跑（13 依賴它）

## 題目

### 型別上的兩個地雷（實測型別檔，寫死在這裡，不要重新猜）

1. **`toolUses` 不在 `turn.step` 的輸入 `e` 上，在 `next(e)` resolve 的結果上**（`TurnStepInput` 沒有 `toolUses` 欄位；`TurnStepResult` 才有）。所以 `turn.step` 的 hook 必須先 `const result = await next(e);`，用 `result.toolUses` 餵 `applyTurnStep`，最後 `return result;`（I13 的「`return next(e)`」在這裡的意思是「回傳 `next(e)` resolve 的值」，不是「不能在中間讀它」）。
2. **`session.receive` 的 matcher 是 `{ origin: { kind: "task-notification" } }`**（`origin` 是物件 `{ kind }`，不是字串）；`on("session.receive", { origin: { kind: "task-notification" } }, …)`。

### `hooks/observe.ts`（新，純函式，不 import `claude-code` 值、不碰 `$`）

```ts
export type PendingSpawn = { description: string; model?: string; at: number };
export type Cells = Record<string, Cell>;

export const applyTurnStart = (cells: Cells, e: { turnId: string; text: string }, now: number): Cells;
export const applySpinner = (cells: Cells, e: { requestId: string; mode: string }, now: number): Cells;
export const applyTurnStep = (
  cells: Cells,
  e: { turnId: string; agentId?: string; toolUses: readonly { name: string; input: unknown }[] },
  now: number,
) => { cells: Cells; pending: PendingSpawn[] };
export const applyTurnComplete = (cells: Cells, e: { turnId: string; agentId?: string }, now: number): Cells;
export const applyTaskNotification = (cells: Cells, text: string, now: number): Cells;
```

行為（§2.6a 對照表）：

- **`applyTurnStart`**：開一個 `kind: "main"` cell（`id = e.turnId`、`label: "main"`、`desc = e.text.slice(0, 60)`、`status: "running"`、`firstAt: now`、`updatedAt: now`、`steps: [{ name: "prompt", t0: now }]`）。`turnId` 已存在時視為重入（同一 turn 的第二次事件不重開，只是 no-op；不應該發生，但不炸）。
- **`applySpinner`**：目標 cell = `cells[e.requestId]`（sub loop）；找不到就退到「目前唯一一個 `kind:"main" && status:"running"` 的 cell」（main 的 spinner `requestId` 是什麼，票 16 實測會補一條紀錄）。目標存在、`e.mode ∈ {"responding","thinking","requesting"}`、且該 cell 最後一個 step 的 `name !== "think"` → push `{ name: "think", t0: now }`、`updatedAt: now`。都不成立就原樣回傳（不丟錯、不建立新 cell——這個 hook 只觀察，不開 cell）。
- **`applyTurnStep`**：目標 cellId = `e.agentId ?? e.turnId`。cell 不存在（sub cell 的 `turn.step` 可能比 poll 先看到這個 agent）就先建一個最小 sub cell（`kind:"sub"`、`desc: ""`、`model: undefined`、`status:"running"`、`firstAt: now`、`steps: [{name:"prompt", t0: now}]`——poll（票 13）之後補 `desc`／`model`，同一個 id 不會重建）。對每個 `toolUses[]` push 一個節點：`name` = 工具名；`Bash` 的 `detail` = `input.description`（沒有就 `input.command` 前 40 字）；`Agent` 額外回傳一筆 `pending: PendingSpawn = { description: input.description, model: input.model, at: now }`（不建立 sub cell——`Agent` 呼叫當下還不知道新 subagent 的 id，配對留給票 13 的 poll，§2.6「model 對回去」）。每個 push 都更新 `updatedAt: now`。`steps` 超過 `STEPS_MAX`（票 10 的 `hooks/cells.ts`；本票先用同值本地常數 `64`，票 10 就位後對齊）的壓縮**不在這裡做**——那是儲存層通用規則，留給票 13 的 poll（它每秒跑，有機會做）。
- **`applyTurnComplete`**：**只處理 main**（`e.agentId` 有值就整個 no-op——sub 的完成由票 13 的 poll 觀察 `agent.list()` 的 status 決定，這裡重複處理會讓 sub cell 收到兩次 `reply`，是本票故意不做的事，見下方突變 2）。main cell push `{ name: "reply", t0: now }`、`status: "completed"`、`endAt: now`、`updatedAt: now`。

### `hooks/register.tsx` 加五個 hook

`on("turn.start", …)`、`on("turn.step", …)`、`on("turn.complete", …)`、`on("ui.render", { component: "Spinner" }, …)`、`on("session.receive", { origin: { kind: "task-notification" } }, …)`。每個都：讀 `$.store.get("agents.cells") ?? {}` → 呼叫對應 `apply*` → 寫回 `$.store.set("agents.cells", …)` → **除了 Spinner**，`$.ui.invalidate("ui.render")` → `return` `next(e)`／`next(e)` 的結果（依上面兩個地雷）。`applyTurnStep` 回的 `pending` 累加進本模組的模組級變數 `let pendingSpawns: PendingSpawn[] = []`（SDD §2.6「記憶體，不進 store」；不是 `$.store`，所以不算多一個 `$` op）；本票不消費它，票 13 的 poll 會（需要一個讀取入口，本票先在 `registerHooks` 內把它包成 `takePending(): PendingSpawn[]`——回傳目前全部並清空——供 13 之後接線；本票的驗收不測 `takePending` 有沒有被呼叫，只測陣列真的在累積）。

**`Bash{ run_in_background: true }`／`Monitor`／`Workflow` 開背景 cell、`session.receive` 的 regex 抓 description 關 bg cell**：這兩件事也在 `applyTurnStep`／`applyTaskNotification` 裡（同一批觀察邏輯，SDD §2.6「背景任務」段）：
- `applyTurnStep` 看到 `toolUses[]` 裡 `name` 是 `Bash` 且 `input.run_in_background === true`，或 `name` 是 `Monitor`／`Workflow`，就開一個 `kind: "bg"` 的 cell（`id = \`${now}-${desc}\`` — desc 同上的 detail 規則；`status: "running"`；`steps: [{name:"prompt", t0: now}]`），**不是 push 到 main/sub cell 的 steps**（背景任務是獨立 cell，這個 toolUse 本身也仍照上面規則在呼叫它的 main/sub cell 裡留一個節點——兩件事都發生）。
- `applyTaskNotification(cells, text, now)` 用具名 regex 常數：
  ```ts
  export const NOTIFICATION_RE =
    /Background command "([^"]+)" completed|Task "([^"]+)"|Workflow "([^"]+)"/;
  ```
  抓到的 description，關掉**最早一條**同名、`kind:"bg"`、`status:"running"` 的 cell：push `{name:"reply", t0: now}`、`status:"completed"`、`endAt: now`、`updatedAt: now`。抓不到就整個 no-op。

### 已知落差（回報，不在本票解）

- SDD I12 的「`hooks:` 恰好 = 第一輪四個 + 這五個（九個）」**沒算 `ui.render{component=Pane}`**——票 16 會再加一個 hook，屆時九個會變十個。本票的 `hooks:` exact 檢查只驗「這五個都在，且沒有 `tool.call`／`classic.*`」，不驗全域恰好九個（那個全域斷言留給稍後收斂 `$` 用量的那張票，目前 12／13／16 都沒被指名做，回報給主 agent 排）。
- `PanelIo` 要有 `cells: () => Promise<Cells>` 與 `takePending: () => PendingSpawn[]` 給 `needsAgents` 面板讀「目前的 `agents.cells`」與「取走待配對的 spawn」——SDD §1.1a 的 `PanelIo` code block 沒列這兩個，但票 13 的 poll 沒有它們做不了 diff（`poll(io)` 沒有別的管道讀舊狀態）。本票只在 `register.tsx` 準備 `takePending`；`cells()` 的加入與 `panel.ts` 的型別擴充留給票 13（見該票）。

## 突變

1. label `turn.step: toolUses read before next resolves` — 把 `const result = await next(e);` 改成在呼叫 `next` 之前就讀 `e.toolUses`（例如 `const result = { ...e, toolUses: [] } as TurnStepResult;`），讓工具事件不再進 cells。
2. label `turn.complete: sub loop double-closes` — 拿掉 `if (e.agentId) return cells;`（或等價的 no-op 判斷），讓 `applyTurnComplete` 對 sub 也 push reply。
3. label `spinner: tool-use counted as thinking` — `THINKING_MODES`（或等價集合）多塞進 `"tool-use"`。
4. label `session.receive: hooks does not return next's result` — 把 `on("session.receive", …)` 那支 hook 的 `return next(e)`（或它 resolve 後的值）改成 `return { text: e.text };`（不呼叫 `next`）。

## harness 擴充（本票要做，骨架測試依賴它；`tests/hooks/harness.ts` 是測試基礎設施，不是驗收測試）
`fakeEngine(opts?)` 多接受並回傳：
- `env: Record<string, string>`（`$.env.get(name)` 回它；沒有就 `undefined`；每呼叫 `calls["$.env.get"]++`）。
- `agents: AgentInfo[]`（`$.agent.list()` 回它的深拷貝；`calls["$.agent.list"]++`）。
- `$.ui.open(args)`／`$.ui.close(id)`：只計數（`calls["$.ui.open"]`、`calls["$.ui.close"]`）並記 `opened: string[]`。
- `setNextResult(event, value)`：下一次 `fire(event, e)` 的 `next(e)` resolve 成 `value`（用一次即清）；沒設就照舊（`ui.render` 回 `NEXT_RENDER`，其他回 `{}`）。`turn.step` 的 `toolUses` 在 result 上，測試用它餵。
- `fire` 的 matcher 比對改成**巢狀部分比對**（`{ origin: { kind: "task-notification" } }` 要能命中 `e.origin.kind`）；字串值仍 `===`。
- `clock.now` 維持 async（2.1.274）。
