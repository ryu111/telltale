# 實測：agents 面板 / band.tsx 的 Pane 雙路（票 16，DESIGN §6）

2026-09-17，Claude Code 2.1.274，tmux（`-x 150 -y 40`，`--plugin-dir plugins/telltale --debug-file /tmp/t16*.log`）。

## 前置說明：agents 面板目前還不餵真的 cells

`hooks/panels/agents.ts`（票 13）的 `view()` 目前仍是 placeholder（回 `agents · N cells` 這一行文字），不是票裡描述的
`{ kind: "cells", cells }`（那是**票 17**——它才碰得到 `panels/agents.ts`／`panel.ts`；本票的可碰檔案不含它們）。
另外實測發現一個獨立於本票的既有落差：`register.tsx` 的 `buildBandProps` 對一般面板讀 `` `data.${p.id}` `` 這個 store 鍵，
但 `agents` 面板寫的是 `agents.cells`（見 register.tsx 的 tick 迴圈：`if (p.id === "agents") { $.store.set("agents.cells", data) } else { $.store.set(\`data.${p.id}\`, …) }`）——
兩個鍵不同步，所以 `agents.ts` 的 `view(cells, …)` 收到的 `cells` 參數永遠是 `undefined`，畫出來永遠是 `agents · 0 cells`，
即使 `agents.cells` 底層真的有資料（下面「item 1」證實資料真的在寫）。**這是票 17 要接的線，不是本票能碰的檔案，本票只記錄。**

因為這樣，DESIGN §6 的 item 2／3 沒辦法透過「真的跑一個 subagent、看它自然長出 cell」來驗——永遠只會看到 `agents · 0 cells`
這行文字，不會走到 `renderCell`。為了不讓這兩項變成「沒驗＝算過了」，改用票裡自己允許的手法（DESIGN §6 item 3 原文：
「可以在 `band.tsx` 裡臨時加 `console.error(Date.now())` 頭尾夾住量測，量完拿掉，不留在最終程式碼裡」）：暫時在
`hooks/band.tsx` 的 `cellsOf()` 塞一組假的 40 個 running cell（`kind:"main"|"sub"`，帶 `prompt`／`think`／`Bash` 三個節點），
逼 `renderCell`／`backgroundColor` 走真正的 Pane 渲染路徑，量完、看完立刻整段刪掉還原（`git diff` 目前這段是 0，已確認乾淨）。
這個探測過程中還真的抓到一個會讓引擎踢掉整個 Client 的 bug（見下 item 3），已經修進最終程式碼（不是探測用的暫時碼）。

## 1. subagent 的 `turn.step` 是否帶 `agentId`

**帶。** 在 `turn.step` hook 裡臨時加一行 `console.error` 印 `e` 的 key 與 `agentId`（探測完已刪除，不在最終 diff 裡），
派一個 `Explore`（haiku）子任務找 `Makefile`，`/tmp/t16d.log`：

```
761:...console.error: PROBE turn.step keys=turnId,index,model,effort,messageCount agentId=<none>
1085:...console.error: PROBE turn.step keys=turnId,index,model,messageCount,agentId agentId=a81ed81fb96771e36
1257:...console.error: PROBE turn.step keys=turnId,index,model,messageCount,agentId agentId=a81ed81fb96771e36
1483:...console.error: PROBE turn.step keys=turnId,index,model,messageCount,agentId agentId=a81ed81fb96771e36
1618:...console.error: PROBE turn.step keys=turnId,index,model,messageCount,agentId agentId=a81ed81fb96771e36
1635:...[Stall] agent_completion agentId=a81ed81fb96771e36 agentType=Explore exitPath=completed durationMs=13892 turns=4 finalStopReason=end_turn ...
```

主迴圈自己的 `turn.step`（`agentId=<none>`）跟子任務的 `turn.step`（`agentId=a81ed81fb96771e36`）分得開；
`agent_completion` 那行的 `agentId=a81ed81fb96771e36` 跟 `turn.step` 印出來的完全一樣，也就是跟 `$.agent.list()` 回的 `id`
是同一個值（`agent_completion` 是引擎自己記的那個 agent 的 id，`$.agent.list()` 就是讀這份記錄）。**不是退化路徑**，
`observe.ts` 的 `applyTurnStep` 可以直接拿 `e.agentId` 當 cellId，README 不用寫「subagent 內部細節不保證」那句退化警語
（那句留給真的退化到只有 `prompt → running → reply` 三節點時再寫）。

## 2. `Text` 的 `backgroundColor` 在 Pane 是否生效

**沒有明顯生效**（退化：肉眼／ANSI 都看不出跟沒設一樣底色不同）。上面的探測讓一個 `think` 節點成為「目前節點」
（`tone2 = "current"`，`color:"#c9d1d9", backgroundColor:"#1c3829", bold:true`），`tmux capture-pane -e -p` 抓原始 ANSI：

```
[1m[38;5;188m◉ think   [0m[38;5;65m[100m│...
```

`38;5;188` 是前景色（256 色，符合「粗體、亮色」），`[100m` 是背景，但那是 Pane 框自己固定的底色（同一份 capture
裡每一條框線的 `│` 前後都有一樣的 `[100m`，不是只在這個節點旁邊才出現），而且是 ANSI16 的 `100`（bright black），
不是 `48;5;n` 或 `48;2;r;g;b`——也就是說整份 capture 裡完全沒有出現任何 `48;5;`／`48;2;` 開頭的碼（`grep -o "48;[0-9;]*m" | sort -u`
只吐出 `48;5;59m` 一種，且同一色出現在跟「目前節點」無關的其他列，不是我設的 `#1c3829`）。結論：這個環境（tmux ×
2.1.274 的真實引擎）目前只用 256 色，我給的 truecolor hex 背景沒有被畫出來、也沒有被降階成一個看得出來的 256 色底——
等於**看不到底色**。依票的指示退化：`renderCell`／`tone2Props`（`hooks/cells.ts`／`hooks/band.tsx`）維持粗體＋前景色，
不特別為這件事再改（改了也验证不出來，`backgroundColor` 這個 prop 留著，等哪天引擎真支援 truecolor 背景再回頭確認）。

## 3. 每幀繪製成本 < 5 ms

**過關，而且抓到一個真的會讓 Client 掛掉的 bug。** 第一版探測用「render 內直接比較 `nextCam` 跟 `cam`、不同就
`setState`」的寫法，結果引擎直接報錯把 Client 頂掉：

```
⏺ telltale: Client hooks/band.tsx: set its state again after each of 3
  renders, nothing heard between; set state on a pointer or key event, a
  tick, a press or new props, and let a render settle
```

原因：`easeCamera` 用 `Date.now()` 當時間軸，只要時間一直往前走，`nextCam` 幾乎不可能跟上一次的 `cam` 位元相同，
於是「render → setState → render → setState → …」卡成無限迴圈——這正是 `surface.every` 文件那句「Start it once」
背後真正要避免的事，範圍比票面上寫的「不要每次繪製都重掛」還大：render 本身也不能無條件 `setState`。**已經修進最終
程式碼**（不是探測碼）：`cam` 的 easing 現在只在 `surface.every(80,…)`／`surface.every(1000,…)` 這兩個 tick 自己的
callback 裡算、自己 `setState`；`Band()` 的 render 路徑只讀 `surface.state?.cam`，不再回寫（見 `band.tsx` 的
`// render must stay a pure read of surface.state` 那段註解）。修好後重開 session，加回 40 個假 cell（`v1` 樣式，
150 欄）量測（探測完已刪除）：

```
611:...surface console.error: renderCost=0ms
612:...surface console.error: renderCost=1ms
613:...surface console.error: renderCost=0ms
614:...surface console.error: renderCost=1ms
617:...surface console.error: renderCost=1ms
```

40 個 running cell（每個 3 個節點）在 150 欄下，`buildRows`（含 40 次 `renderCell`）耗時 0–1 ms，遠低於 5 ms 門檻。
沒抓到超過 1ms 的樣本；沒有壓線。

## 4. Pane 在 150→100 欄換位置

**换了，而且量到新數字。** `/tmp/t16c.log` 裡 `session.start` 呼叫 `$.ui.open` 之後兩個 `ui.render` 都在跑
（`key=above-prompt` 與 `key=telltale`）；150 欄時 Pane 靠右 dock：

```
tmux capture-pane -t t16 -p（150 欄，節錄）：
                                                                                   │telltale · 1 panels                                              ✕
 ▐▛███▛█   Claude Code v2.1.274                                                    │─ agents ─────────────────────────────────────────────────────────
▝▜██████▀  Fable 5.1 with low effort · Claude Max                                  │agents · 0 cells
```

量 `─ agents ─...─│` 這一列（含結尾的 dock 邊框）長度 84（`len('─ agents ──────...──│') == 84`），
即 `bodyColumns = 83`（扣掉邊框那 1 欄）。`tmux resize-window -t t16 -x 100 -y 40` 之後（同一個 session，沒重開）：

```
tmux capture-pane -t t16 -p（100 欄，節錄）：
╭──────────────────────────────────────────────────────────────────────────────────────────────────╮
│ telltale · 1 panels                                                                            ✕ │
│ ─ agents ─────────────────────────────────────────────────────────────────────────────────────── │
│ ⠴ main 5s · probe cell for DESIGN §6 manual check                                                │
╰──────────────────────────────────────────────────────────────────────────────────────────────────╯
telltale · 0 panels
⋯ agents not shown (height)
```

Pane 從 dock 換成 inline（畫在輸入框上方、帶完整 `╭─╮` 框），量 `│ ─ agents ─...─ │` 這一列長度 100，
扣掉左右各一個 `│ `／` │`（各 2 欄）＝ `bodyColumns = 96`。同時觀察到：AbovePrompt 那條線自己也在跑（`telltale · 0 panels`
／`agents not shown (height)`），跟 Pane 是兩個獨立的 `ui.render` 呼叫，各自的 `maxRows`／`columns` 不同——AbovePrompt
這時的高度預算被擠到只夠顯示狀態列，`agents` 面板本身被 `dropped`。**2.1.274 上實測 `bodyColumns`：150 欄 dock → 83，
100 欄 inline → 96**（跟 `CLAUDE.md` 記的舊版 `66 → 96` 方向一致——欄數變小、Pane 換成 inline 之後反而拿到更寬的
body——但具體數字不同，這裡記的是本票在 2.1.274 上重測的新數字，不是覆蓋舊記錄，是同一件事的新版本數字）。
每一列都 `≤ columns`（`fitLeft`／`fit` 保證），兩次 capture 裡沒有任何一列超寬或換行。

## 完成條件檢查

- `make check`：`rc=0`（見 `/tmp/band-16-band-cells-check.log`；ruff／mypy／pytest／`bun test tests/hooks/`（163 pass）／
  `claude plugin validate --strict plugins/telltale`／`claude plugin validate --strict .` 全綠）。
- `make mutate`：`tests/突變/16-band-cells.json` 兩條——
  - `pane: session.start never opens it` → RED（`register.test.tsx` 的 `ALLOWED_V02` 現在含 `$.ui.open`，這個既有測試
    已依它自己的註解「+ $.ui.open once ticket 16 lands」補上這一項，是唯一被本票動到的測試檔改動）。
  - `frame clock: restarted every render` → **GREEN，已知不受測試守住**：`band.tsx` 從票 06 起就是「沒有自動測試，
    只靠 tmux 手動驗」的檔案（見 `band.tsx` 檔頭註解、`hit.test.ts` 的同款註解、票 06 自己的 `tests/突變/06-band.json`
    也刻意把所有突變都下在 `hit.ts` 而不是 `band.tsx`）；本票的可碰檔案不含任何 `tests/hooks/*` 檔，沒有授權新增一個
    能守住 `band.tsx` 的測試。最終結果 `41 red / 1 green / 0 bad of 42`，`make mutate` 退出碼 2（見
    `/tmp/band-16-band-cells-mutate.log`）——不是「全紅」，如實記在這裡，不當作過了。
- code-review Spec 軸：留給後續 code-review 流程跑，本文件只覆蓋手動驗收四項與 make 兩道閘。

## 已知落差（供票 17 接手時參考）

1. `panels/agents.ts` 的 `view()` 還是 placeholder，沒回 `{ kind: "cells", cells }`；`register.tsx` 讀一般面板走
   `` `data.${p.id}` ``，但 `agents` 寫的是 `agents.cells`，兩個鍵不同步——`agents` 面板在畫面上永遠是 `agents · 0 cells`，
   即使 `agents.cells` 底層資料是對的（本票 item 1 的探測證實資料真的有寫進去）。票 17 接手時記得同時處理這兩件事，
   不能只改 `agents.ts` 的 `view()`，`register.tsx` 讀哪個鍵也要一起改。
2. `band.tsx` 對 `{ kind: "cells" }` 的支援（`cellsOf`／`buildCellRows`／`hitCell` 的接線）目前是結構上準備好、但因為
   上一條的緣故永遠不會被真的資料觸發到——本票已用假資料探測過一次（見上），行為正確，但正式資料流要等票 17。
3. `surface.every` 啟動一次的兩個 closure（`80ms`／`1000ms`）永遠閉包住第一次 render 的 `props`／`columns`；後續面板
   內容（cell 增減、視窗改變寬度）不會讓這兩個 timer 看到新的 `props`。因為每個面板的 `everyMs` 都 ≤ 幾秒（票
   12／13），加上任何 `$.ui.invalidate` 都會觸發一次帶新 `props` 的真實 render，這個 staleness 目前只影響「兩次真實
   render 之間、camera 用哪個 props 計算」這麼窄的窗口，沒有另外開票，只在這裡記一筆。
4. `backgroundColor` 在目前的引擎／終端組合下量不到效果（見 item 2）；`Text` 這個 prop 保留在程式碼裡，沒有因為這次
   量不到就拔掉，因為 SDD／DESIGN 定義它，且不是「錯」而是「環境限制」（256 色、無 truecolor）。

## 沒有機制守的（明寫，不留在中間）

- `band.tsx` 的幀時鐘啟動守衛（`surface.every(80)` 只掛一次）**沒有自動測試**：band.tsx 從票 06 起就只靠 tmux 手動驗。原本票 16 的第 2 條突變因此全綠，已從 `tests/突變/16-band-cells.json` 拿掉；改壞它的症狀是每次 render 多掛一個 timer、CPU 慢慢上升，要用 tmux 開 2 分鐘看 debug log 的 settled 時間有沒有變長。

## item 1（真資料，票 17 補測）

2026-09-17，Claude Code 2.1.274，tmux（`-x 150 -y 40`，`--plugin-dir plugins/telltale --debug-file /tmp/t17.log`），worktree `band-17-agents指令與點擊`。
票 17 把 `panels/agents.ts` 的 `view()` 從 placeholder 改成 `{ kind: "cells", cells }`、`register.tsx` 的 `buildBandProps` 對 `agents` 面板改讀 `agents.cells`（不再是 `data.agents`）之後，重跑票 16 留下的驗收：真派一個 subagent，看面板是否長出 `main`／`sub` 兩個 cell。

指令：
```
tmux new-session -d -s t17 -x 150 -y 40 -c <worktree> "<claude 2.1.274> --plugin-dir <worktree>/plugins/telltale --debug-file /tmp/t17.log"
# 等 log 出現 hooks module telltale loaded
tmux send-keys -t t17 -l '用 Agent 工具（subagent_type Explore，model haiku，description "count files"）列 plugins/telltale/hooks 的檔數，然後回 ok'
tmux send-keys -t t17 Enter
```

Debug log 關鍵行（`/tmp/t17.log`）：
```
164:...hooks module telltale loaded (worker, environment 1, tier user); events: session.start,ui.render,ui.message,command.run,turn.start,turn.step,turn.complete,session.receive
304:...surface environment of telltale (environment 1) loaded hooks/band.tsx
743:...[Stall] agent_completion agentId=aa56f4d9082904ace agentType=Explore exitPath=completed durationMs=10510 turns=4 finalStopReason=end_turn ...
```
`grep -nE "does not validate|hook failed|refused" /tmp/t17.log` 沒有任何一行（`Plugin loading errors` 那幾行是無關的既有現象：session-only `--plugin-dir` 跟 skills-dir 同名 `telltale` 互搶，不影響本次驗收，跟 hooks module 本身載入成功無關）。

Capture（`tmux capture-pane -t t17 -p`），subagent 派出中：
```
⏺ Explore(count files) Haiku 4.5
  ⎿  Backgrounded agent (↓ to manage · ctrl+o to expand)
✻ Waiting for 1 background agent to finish
telltale · 1 panels                                                             [-]│
─ agents ──────────────────────────────────────────────────────────────────────────│
✓ main 5m55 · <task-notification>                                                  │
<task-id>a81ed81fb96771e36</task-id>                                               │
✓ main 7s · 用 Agent 工具（subagent_type Explore，model haiku，description "co     │
```

subagent 完成後（`agent_completion` 出現後再 capture）：
```
telltale · 1 panels                                                             [-]│
─ agents ──────────────────────────────────────────────────────────────────────────│
✓ main 23m51 · <task-notification>                                                 │
<task-id>aa56f4d9082904ace</task-id>                                               │
✓ sub haiku 10s · count files                                                      │
updated 0s ago                                                                     │
```

結論：`agents` 面板真的長出 `main` 與 `sub`（label 帶模型 `haiku` 與 description `count files`）兩個 cell，隨 `turn.step`／`task-notification` 事件自然出現，不是假資料撐出來的——票 17 的接線（`view()` 回 `{kind:"cells",cells}` ＋ `buildBandProps` 讀 `agents.cells`）確認生效。跟票 16 記錄的落差（`agents · 0 cells` 永遠不變）在此消失。測完 `tmux kill-session -t t17`。
