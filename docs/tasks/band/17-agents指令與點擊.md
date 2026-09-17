# 17-agents 指令與點擊：`/telltale agents style|edge|size|clear`、`onRow`

- 對應 SDD 節次：§1.6 v0.2 追加表、§2.6「onRow」項、§5 I12（`calls:`／`hooks:` 最終 exact）
- 可碰檔案：`plugins/telltale/hooks/command.ts`、`plugins/telltale/hooks/panels/agents.ts`、`plugins/telltale/hooks/panel.ts`、`plugins/telltale/hooks/register.tsx`、`tests/突變/17-agents指令與點擊.json`
- 相關檔案：
  - `docs/SDD.md`（§1.6、§2.6、§2.1 v0.2 鍵表）
  - `hooks/command.ts`（現況：`runTelltale(args, state) → { text, panels }`，本票要擴充回傳形狀，見下）
  - `hooks/panels/agents.ts`（票 13：`agents.cells` 的生命週期，本票的 `clear`／`onRow` 要動同一份資料）
  - `docs/tasks/band/00-共同規則.md`
- 驗收測試：`hooks/agents-command.test.ts`
- 完成條件：`make check` 全綠；驗收測試由紅轉綠；`make mutate` 對本票三條突變全紅；code-review Spec 軸零缺漏、零超範圍
- 依賴（Blocked by）：13、16（16 先落地 `register.tsx` 的 Pane／AbovePrompt 雙路，本票在它之上加 command 與 `ui.message{row}` 的分派，避免兩票同時改 `register.tsx` 衝突）
- 並行度：單獨跑

## 題目

### `hooks/command.ts`：`TelltaleResult` 加 `writes`

`/telltale agents *` 這幾個子指令不是切面板開關，是寫別的 `$.store` 鍵（`style.agents`／`edge.agents`／`size.agents`／`agents.cells`），現有 `TelltaleResult = { text, panels }` 裝不下。擴充：

```ts
export type TelltaleResult = {
  text: string;
  panels: Record<string, boolean>;
  writes?: Record<string, unknown>;   // 有變更的 store 鍵；register.tsx 逐鍵 $.store.set，全部 undefined 就整個省略這欄
};
```

`runTelltale` 加一個分支：第一個 token 是 `agents` 時（且已知面板裡有 `agents`——沒有的話按未知 id 處理，維持 §1.6 v0.1 表的行為，不特別報 `agents` 不存在，因為第一輪表沒把 `agents` 當特殊字保留，這裡是二階子指令，不是新的保留字）：

| 輸入 | `text` | `writes` |
|---|---|---|
| `agents style` | `agents style: <目前值>` | 無 |
| `agents style v1\|v2\|v4` | 同值 → `agents style: v2 (unchanged)`；不同 → `agents style: v2 → v1` | `{ "style.agents": "v1" }` |
| `agents style <其他>` | 落到「壞語法」，回 usage（§1.6 v0.1 的壞語法規則沿用） | 無 |
| `agents edge` | `agents edge: <目前值>` | 無 |
| `agents edge right\|bottom` | 同上格式 | `{ "edge.agents": "right" }` |
| `agents edge top\|left`（引擎沒有的值） | `agents edge top: not available in this build` | 無 |
| `agents size` | `agents size: <目前值>` | 無 |
| `agents size summary\|compact\|full` | 同上格式，鍵是 `size.agents`（跟點擊改的是同一把鑰匙——見下 `onRow`／`hit.ts` 那條，本票只保證 command 這邊寫對鍵名，點擊那邊是票 11 的範圍，兩邊都寫 `size.agents` 就算同步，不必互相 import 對方的字串常數，但**兩邊字面值一致**這件事本票要測，見下方測試清單） | `{ "size.agents": "full" }` |
| `agents clear` | `agents: cleared N`（N = 清掉的數量，可以是 0） | `{ "agents.cells": <cells 拿掉所有 status ∈ {failed,killed,orphan} 的條目後的物件> }` |

`runTelltale` 需要 `TelltaleState` 多帶目前的 `style.agents`／`edge.agents`／`size.agents`／`agents.cells` 這四個值（呼叫端 `register.tsx` 的 `command.run` hook 組進去，跟現有 `layout` 一樣是呼叫前算好塞進 `state`，`command.ts` 仍是純函式、不碰 `$`）：

```ts
export type TelltaleState = {
  … 既有欄位 …
  agentsView?: { style: "v1" | "v2" | "v4"; edge: "right" | "bottom"; size: "summary" | "compact" | "full"; cells: Record<string, Cell> };
};
```

`edge` 合法值目前只有引擎給的 `right`／`bottom`（SDD §1.5「2.1.274 引擎只給兩個位置」——`right` 對應 `Pane` 的 `dock`，`bottom` 對應「窄時自動落到輸入框上方」；`top`／`left` 一律 `not available in this build`）。`agentsView` 缺席（面板還沒註冊過 `agents`，理論上不會發生，`agents` 是 `defaultOn: true` 且不受 `TELLTALE_DEV` 限制）時，`agents *` 系列指令整個落到「未知 id」——這條防禦性分支寫測試但不必寫得漂亮。

### `hooks/register.tsx`：`command.run` 接 `writes`；`ui.message` 接 `{ kind: "row" }`

`command.run` hook（票 07 已有）在算完 `result` 後，除了既有的 `panels` 變更寫回，`result.writes` 有值就逐鍵 `$.store.set(key, value)`，任一鍵有寫就 `$.ui.invalidate("ui.render")`（跟 `panels` 變更共用同一次 invalidate，不要因為兩者都變就 invalidate 兩次）。

`ui.message` hook 加一個分支：`data.kind === "row"` 且 `data.id === "agents"` → 讀 `agents.cells`／`agents.expanded`，呼叫 `agents.ts` 匯出的 `onRow(hit, { cells, expandedAt: … })`（見下），把回傳的新狀態寫回對應鍵，`$.ui.invalidate`。`kind === "stage"`／`kind === "view"`（票 11 的段位循環／視圖切換）沿用票 11 已接好的分支，本票不重複實作，只是不要讓新加的 `if` 擋掉它們（`ui.message` 現在要依 `kind` 分派到至少三種：`toggle`／`stage`／`view`／`row`）。

### `hooks/panels/agents.ts`：`onRow`

```ts
export type RowMessage = { hit: string };
export type OnRowResult = { cells: Record<string, Cell>; expanded: { id: string; at: number } | null };
export const onRow = (hit: string, cells: Record<string, Cell>, now: number): OnRowResult;
```

行為（SDD §2.6「onRow」）：
- `cells[hit]` 不存在 → 原樣回傳（`expanded` 留 `null`，防禦性，不假設點擊一定命中存在的 cell）。
- `status ∈ {"failed","killed","orphan"}` → `cells[hit].dismissed = true`（cell 本身留著，票 14／15 的 render 負責不畫 `dismissed` 的——本票不動 render，只寫這個欄位）。
- `status === "completed"` → 回 `expanded: { id: hit, at: now }`（**10 秒後 Client 端自己判斷過期**，`now - expandedAt >= EXPANDED_MS(10_000)` 就當作 `null`——這是純顯示邏輯，票 10／14／15 的 `hooks/cells.ts` 純函式範圍，本票只負責把 `expanded` 寫進 store 這一步；`docs/實測/agents.md`（票 16）已經手動看過展開，本票用假時鐘測「10 秒後 Client 邏輯視為 null」這件事——用一個獨立的純函式 `isExpanded(expanded, now): boolean`，本票加進 `hooks/panels/agents.ts` 一起匯出，供本票的測試與將來的 `band.tsx` 共用）。
- `status === "running"` → 收合／展開切換：本票用 `cells[hit].dismissed` 欄位**反著借用**不合適（那是「點掉」的語意），改用回傳的 `cells` 裡把該 cell 標一個新欄位 `collapsed?: true` 並反轉它（`Cell` 型別要加這個可選欄位——若 `panel.ts` 不在本票可碰範圍內且票 13 也沒加過，回報衝突，本票暫時把 `collapsed` 塞進 `Cell` 型別，需要動 `hooks/panel.ts`，超出本票原可碰清單，視為必要延伸，做完在 code-review 說明）。

## 突變

1. label `agents size: writes wrong key` — `size.agents` 打錯成 `size_agents`。
2. label `agents edge: unsupported value silently accepted` — 拿掉 `right`／`bottom` 白名單判斷，讓 `top`／`left` 也直接寫入。
3. label `onRow: failed cell not dismissible` — `status ∈ {"failed","killed","orphan"}` 的判斷改成只剩 `"failed"`。

## 已知落差（回報）

- `Cell.collapsed?: true` 是本票新加的欄位，`panel.ts` 不在本票原始可碰清單裡（票 13 也沒加），本票視為必要延伸做了，請主 agent 核對票 13／10／14／15 有沒有同時在動 `Cell` 型別、避免定義衝突。
- `command.ts` 的 `agents size` 與 `onRow`／點擊（票 11）寫同一個 `size.agents` 鍵；本票只測 command 這邊字面值正確，兩邊字面值是否真的一致（沒有各自手誤成 `"Full"`／`"full "`）建議在票 11 或本票收尾時各加一個交叉測試，目前分散在兩張票各自的測試檔裡、沒有一個地方同時看兩邊。

## 票 16 實測留給本票的接線（必做，不然 agents 面板永遠是 `agents · 0 cells`）
1. `panels/agents.ts` 的 `view()` 目前是 placeholder，要改成回 `{ kind: "cells", cells }`（SDD §1.1a）。
2. `register.tsx` 的 `buildBandProps` 對一般面板讀 `data.<id>`，但 agents 的資料在 `agents.cells`：要讓 agents 面板的 `view` 收到 `agents.cells`（或統一鍵名），並把 cells 放進 `BandPanel` 交給 band.tsx（band.tsx 的 `cellsOf()` 已經會吃）。
3. 接好後**重跑票 16 的 tmux 驗收第 1 項**：真的派一個 subagent（Explore、haiku），capture 要看到 agents 面板長出 main 與 sub 兩個 cell、節點隨事件出現；把 capture 與 log 行補進 `docs/實測/agents.md` 的「item 1（真資料）」一節。可碰檔案因此加：`plugins/telltale/hooks/register.tsx`（已在）、`docs/實測/agents.md`。
