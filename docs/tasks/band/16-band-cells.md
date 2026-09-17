# 16-band-cells（手動）：Pane／AbovePrompt 雙路、幀時鐘、cell 點擊、真機三個未知數

- 對應 SDD 節次：§1.5 v0.2 追加（Client）、§2.5（`$.ui.open`）、§3 v0.2 pipeline 第二、三段、DESIGN.md §6、§5 I12（完整版）
- 可碰檔案：`plugins/telltale/hooks/band.tsx`、`plugins/telltale/hooks/register.tsx`、`plugins/telltale/hooks/hit.ts`、`docs/實測/agents.md`、`tests/突變/16-band-cells.json`
- 相關檔案：
  - `docs/DESIGN.md`（全文，§6 是本票的驗收清單）
  - `docs/SDD.md`（§1.5、§2.5、§3、I12）
  - `hooks/panels/agents.ts`（票 13：`Cell` 的 `view()` 回 `{ kind:"cells", cells }`）
  - `hooks/cells.ts`（票 10／14／15：`renderCell`；本票是它第一次真的被 `band.tsx` 呼叫）
  - `.claude/types/claude-code.d.ts`：`open`（2100–2107 行，`PaneOpenArgs` 的 `id`／`title`／`rows`）、`close`（2108–2116 行）、`Pane`（6945–6982 行，`bodyColumns`／`placement`）、`ClientSurface.every`（票 06 已讀過的區段，本票加讀 `surface.every` 的簽名附近 20 行）
  - `docs/tasks/band/00-共同規則.md`
- 驗收：本票**手動**，交付物是 `docs/實測/agents.md`；DESIGN §6 四項每項要貼 tmux capture 片段 + 對應 `/tmp/tt.log` 行；沒貼證據的項目算沒驗（不接受文字描述代替截圖／log）
- 完成條件：`make check` 全綠（含既有 exact 測試不倒退）；`docs/實測/agents.md` 四項全部有證據；code-review Spec 軸零缺漏、零超範圍
- 依賴（Blocked by）：13、15
- 並行度：**單獨跑，且與 17 不可並行**——兩票都要動 `register.tsx`（16 加 `$.ui.open`／`ui.render{Pane}`／AbovePrompt 退路；17 加 command.run 對 `style.agents`／`edge.agents`／`size.agents`／`agents.cells` 的寫入與 `ui.message{kind:"row"}` 的 `onRow` 分派）。本票先跑，17 依賴本票（下修 map.md 時一併改：17 的 Blocked by 從「13」改成「13、16」）。

## 題目

### `hooks/register.tsx`

`session.start` 內 agents 面板存在時 `await $.ui.open({ id: "telltale", title: "telltale" })`（SDD §2.5；引擎 2.1.274 只給 `Pane`（≥ 某寬度靠右 dock）與窄時自動落到輸入框上方兩個位置，開發者不選——呼叫 `open` 之後引擎自己決定畫哪裡）。新增 `on("ui.render", { component: "Pane" }, …)` 與既有 `on("ui.render", { component: "AbovePrompt" }, …)` **兩個 hook 呼叫同一個 `Band` Client**（同一個 `<Client key="band" module="./band.tsx" props={…} />`，`props` 的算法不變——只是現在兩個 surface 都可能觸發它；`e.viewport?.columns` 在 Pane 底下量到的是 `bodyColumns`，不是整個終端寬，這正是 DESIGN §6 第 4 項要驗的事）。

### `hooks/band.tsx`

`Band` 改用 `surface.every(80, (frame) => { … })` 起一個幀時鐘（**只在 `surface.state` 還是 `undefined` 時啟動一次**，SDD §0 已知落差那條，不要每次繪製都重掛）；每幀重畫 `status === "running"` 或抵達中（`now - steps.at(-1).t0 < TRANSIT_MS + BIRTH_MS`）的 cell，其餘 cell 用 `surface.every(1000, …)` 只重算經過時間。`agents` 面板的 `view()` 回 `{ kind: "cells", cells }` 時，`Band` 改叫 `renderCell(cell, style, w, h, now, frame, cam)`（票 10／14／15 的 `hooks/cells.ts`）逐個排版；hello／clock 仍走舊的 `PanelLine` 畫法（兩套並存，`kind` 判斷走哪條）。cell 點擊：命中判定沿用 `hit.ts` 的 `rowsOf` 家族，補一個 `hitCell(y, x, …): string | null`（cell 內的哪一列對到哪個 `cellId`），命中就 `surface.post({ kind: "row", id: "agents", hit: cellId })`。

### 真機要驗（DESIGN §6，逐項照抄 + 本票的做法）

1. **subagent 的 `turn.step` 是否帶 `agentId`**：tmux 裡真的派一個 subagent（例如 `Explore` 找一個檔案），`--debug-file` 開著，grep `/tmp/tt.log` 找 `turn.step` 事件的 payload，確認 `agentId` 有沒有出現、值是不是等於 `$.agent.list()` 回的 `id`。**退化（拿不到）的話**：附上嘗試紀錄——hook 收到的事件清單（哪幾個事件真的來、有哪些欄位）＋ 對應 debug log 片段；退化時 sub cell 只有 `prompt → running → reply` 三節點（票 12 的最小 stub cell 已經是這個形狀，不用再改程式，只要在 `docs/實測/agents.md` 記錄「已驗證是這個退化路徑」），README（票 18）要寫「subagent 內部細節不保證」。
2. **`Text` 的 `backgroundColor` 在 AbovePrompt／Pane 是否生效**：畫一個目前節點（白粗體＋淡綠底）截圖，肉眼確認底色有沒有畫出來；拿不到就在 `renderCell` 退成只粗體（`hooks/cells.ts` 的職責，本票只負責發現與記錄，不改 `cells.ts` 除非它不在票 10／14／15 的可碰範圍——若那三票還沒完成就先跳過這條，記「blocked：等票 10/14/15」）。
3. **每幀繪製成本 < 5 ms**：Pane 開到 40 列 × 150 欄、塞滿 cell（多派幾個背景 Bash 撐滿），量 `renderCell` 總和耗時（可以在 `band.tsx` 裡臨時加 `console.error(Date.now())` 頭尾夾住量測，量完拿掉，不留在最終程式碼裡）；記錄實測毫秒數，判斷有沒有壓線。
4. **Pane 150→100 欄換位置**：resize tmux 視窗，觀察 `bodyColumns`（DESIGN 已知 66→96 是舊實測值，本票在 2.1.274 上重測，記錄新數字）與 Client 收到的 `surface.columns` 是否跟著變、每列是否仍然 `≤ columns`。

## 突變

1. label `pane: session.start never opens it` — 拿掉 `$.ui.open(…)` 那一行呼叫。
2. label `frame clock: restarted every render` — 把 `surface.state === undefined` 的啟動守衛拿掉，讓 `surface.every` 每次繪製都重掛。
