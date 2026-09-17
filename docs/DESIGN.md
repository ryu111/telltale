# DESIGN：agents 面板（telltale v0.2）— 2026-09-17 定案

> 終端沒有字級、陰影、圓角、補間；能用的只有粗體、明度階、邊框、字元密度、留白、位置（題目 §7.4）。
> 本檔定「長什麼樣、怎麼動」；「怎麼算」在 `docs/SDD.md` §2.6／§1.5。可互動的樣本：`docs/設計/試衣間.html`（同 artifact https://claude.ai/artifact/JGji4nDpf2gKLKv2b8q86G，Version 10）；挑毛病與實作以本檔＋樣本為準。
> 訪談過程中被淘汰的方向（lanes 時序泳道、tree、trace 瀑布、k9s 表格、狀態流看板、軌道）留在 `docs/設計/試衣間-第一輪.html`，只當紀錄。

## 0. 一句話

**一個 cell 一個任務；cell 裡的流程圖隨事件動態長出來；鏡頭跟著最新節點；多個任務就是多個一模一樣的 cell。**

任務＝主迴圈的一輪（main）、一個 subagent、或一個背景任務（shell／Monitor／Workflow）。三種用同一個表示，只有名字與來源不同。

## 1. 三種 cell 樣式（`/telltale agents style v1|v2|v4`）

| 樣式 | 形狀 | 預設用在 | 完成後 |
|---|---|---|---|
| **v1** | 第 1 列＝分隔線＋標題＋任務名稱；第 2–4 列＝橫向方框鏈（每個節點 12 欄寬的 `┌┐│└┘` 方框，節點間 4 欄連線） | 面板貼在 **bottom／top**（寬而矮） | 只剩第 1 列 |
| **v2** | `┌ 標題 ┐` 框；框內第 1 行＝任務名稱；底下直向節點列表（`◉ Bash  make check  4s`），節點間 1 列 `│` | 面板貼在 **left／right**（窄而高） | 縮成 8 欄寬的直欄：`✓ main` 底下每個步驟一行 |
| **v4** | 第 1 列同 v1；第 2 列＝壓成一條鏈的流程 `● prompt ─▸ ● think ─▸ ◉ Bash` | 高度只剩 2–3 列時 | 只剩第 1 列 |

- 標題：`<狀態符號> <名字> <模型> <經過時間>`；名字 main 琥珀、subagent 紫；模型灰；時間藍。
- 任務名稱：main＝這輪 prompt 的前 60 字（`turn.start.text`）；subagent＝`AgentInfo.description`；背景任務＝Bash 的 `description`（缺就 command 前 40 字）。放不下就**跑馬燈**（每 0.3 s 左移一格，循環中間隔 `   ·   `；所有放不下的都跑，使用者裁定）。
- **鏡頭**（v1／v4 橫向）：目標＝最新節點右緣離區域右邊 28 欄（兩個節點寬＋一段連線）；每幀往目標移 25%，差 <1 格貼齊；最新節點永遠完整在畫面內。**v2 縱向**：硬鎖，最新節點永遠在 cell 最底一列，舊的往上推。
- 節點寬度固定 12 欄（名字最多 8 字，超長 `…`）；名字＝工具名或 `think`／`prompt`／`reply`／`Agent`。

## 2. 節點種類與顏色

| 種類 | 來源 | 顏色 |
|---|---|---|
| `prompt` | `turn.start` | 灰 |
| `think` | Spinner `mode` ∈ {responding, thinking, requesting} 且沒有工具在跑 | 紫 |
| 工具（`Bash`、`Read`、`Edit`…） | `turn.step.toolUses[].name`（`Bash(make check)` 的括號內容放細節） | 藍 |
| `Agent` | toolUses 裡的 `Agent`（同時開一個新 cell） | 琥珀 |
| `reply` | `turn.complete` | 綠 |
| 目前節點 | — | 白粗體＋淡綠底 `backgroundColor`（型別檔有此 prop；票 16 實測拿不到就退成只粗體） |
| 已走過的節點 | — | 名字灰（`m`），符號 `●` 保留種類色 |
| 失敗 | status failed／killed | 符號 `✗` 紅粗體、cell 邊框紅、淡紅底 |

調色（Client 用 truecolor，不支援時退 16 色）：底 `#0b0e14`、字 `#c9d1d9`、框 `#232a36`、綠 `#5be49b`、暗綠 `#2f6a4c`、藍 `#79c0ff`、紫 `#c792ea`、琥珀 `#f2c14e`、紅 `#ff6b6b`、灰三階 `#8b949e`／`#4b5563`／`#2f3743`。

## 3. 動態（全部樣式共用；時間常數是定義的一部分）

| 事件 | 畫面 |
|---|---|
| 新節點 B 到（事件） | B 先以 `·` 佔位；**只有 A → B 那條線**跑 `◆` 光點（帶兩格 `·` 尾巴），歷時 `TRANSIT = 600 ms`；其他連線全部靜止 |
| 光點抵達 | 光點停；B 亮起成目前節點（白粗體、淡綠底、框呼吸）；名字 400 ms 內逐字打出、方框從 3 欄展開到 12 欄；**A 與 A 的框壓灰** |
| 目前節點 | 框每 `600 ms` 粗／細交替（呼吸）；經過時間每秒跳 |
| cell running | 邊框暗綠；剛有事件的 1 s 內亮綠粗體 |
| 新 cell | 從右緣滑入 `500 ms`（v2 從下緣） |
| cell 完成 | 標題 `✓`、整個 cell 降到極暗灰；`3 s` 後收合（v1／v4 剩第 1 列；v2 縮成直欄）；`60 s` 後消失。**main 的收合列會合併**：`✓ N turns · <最近一輪名稱>`，點了展開最近 3 輪 10 s |
| cell 失敗 | 節點 `✗`、邊框紅、淡紅底；**留到點掉**或 `/telltale agents clear` |
| 背景任務久跑（> 30 min） | 經過時間變黃，仍是 running |
| 背景任務孤兒（> 2 h 沒通知） | 符號 `?` 黃，留到點掉 |

不做：閃爍、hover、滑出動畫以外的位移動畫。

## 4. 面板貼哪一邊、開合

- 設計上四邊（top／bottom／left／right）都要能貼，各自收合；**2.1.274 引擎只給兩個位置**：`Pane`（寬時右側 dock）與窄時自動落到輸入框上方。v0.2 實作這兩個，`/telltale agents edge` 只接受引擎有的值，其他回 `not available in this build`。
- 開合大小由引擎管（Pane 的寬／高、AbovePrompt 的 `maxRows`）；面板內用三段 `size`（summary＝只有標題列、compact＝每 cell 收合、full＝全展）在引擎給的範圍內切。
- 樣式預設：貼側邊→v2，貼上下→v1，可用 `/telltale agents style` 覆蓋，存 `$.store`。

## 5. 點擊

- 點 cell 標題：展開／收合這個 cell（完成的 cell 點了重新展開 10 s）。
- 點失敗或孤兒的 cell：點掉。
- 點面板標題列：循環段位（第一輪的規則）。

時間常數全部是 `hooks/cells.ts` 的具名 export（`TRANSIT_MS`、`BIRTH_MS`、`BREATHE_MS`、`SLIDE_MS`、`COLLAPSE_AFTER_MS`、`VANISH_AFTER_MS`、`FLASH_MS`、`CAMERA_MARGIN`、`CAMERA_GAIN`、`MARQUEE_STEP_MS`、`LONG_RUN_MS`、`ORPHAN_MS`）；本檔的數字是它們的文件化，改了要一起改。

## 6. 真機要驗（票 16）

1. subagent 內部的工具事件是否由 `turn.step` 帶 `agentId` 送到；拿不到 → subagent cell 只有 `prompt → running → reply` 三個節點（動畫全套照用），main cell 才有完整流程。**退化要附嘗試紀錄才算數**；README 與面板標題要寫「subagent 內部細節不保證」。
2. `Text` 的 `backgroundColor` 在 AbovePrompt／Pane 是否生效。
3. 每幀（80 ms）重畫全滿 cell 的成本 < 5 ms（ClientModule 超時會被卸載）。
4. Pane 在 150→100 欄換位置時 Client 的 `surface.columns` 是否跟著變（已知 `bodyColumns` 66→96）。
