# 14-renderCell：`hooks/cells.ts` 的 v1／v2／v4 靜態排版

- 對應 SDD 節次：§1.1a（`renderCell` 簽名）、§2.6260（v1／v2／v4 定案＋main 歷史合併列）；DESIGN.md §1（三種樣式表）、§2（節點種類與顏色）；不變量 I4（`displayWidth ≤ columns`，套在 `renderCell` 每一行）、I14（v0.2，依票 10「與 SDD 的落差」一節讀成 `renderCell` 輸出）
- 可碰檔案：`plugins/telltale/hooks/cells.ts`、`tests/突變/14-renderCell.json`
- 相關檔案：`docs/SDD.md`（§1.1a、§2.6260）、`docs/DESIGN.md`（全文，尤其 §1、§2）、`docs/設計/試衣間.html` `<script>`（`renderV14`＝v1 的邏輯依據、`renderV24`＝v2 的邏輯依據、`renderV4`＝v4 的邏輯依據、`renderStrip`＝v2 收合形、`title`／`titlePlain`／`glyph`／`nodeCls`／`frameCls`——**只抄演算法，符號與寬度規則以本票為準**）、`plugins/telltale/hooks/width.ts`（`displayWidth`／`fit`）、`plugins/telltale/hooks/cells.ts`（票 10 已完成的 `Step`／`Cell`／常數／`SYMBOLS`／`marquee`／`formatElapsed`／`isCollapsed`）
- 驗收測試：`tests/hooks/cells-render.test.ts`
- 完成條件：`make check` 全綠；驗收測試由紅轉綠；`make mutate` 對本票四條突變全紅；code-review Spec 軸零缺漏、零超範圍
- 依賴（Blocked by）：10
- 並行度：不能與 10、11、15 同時（同碰 `cells.ts`；11 碰不同檔但已完成才輪到 14 沒有強制順序，惟本票假設 10 的匯出已存在）

## 這一票不管的事（留給票 15）

本票的 fixture 一律選 `now` **遠大於**該 cell 所有 `steps[i].t0 + TRANSIT_MS + BIRTH_MS`，讓每個節點都已經「定形」：沒有光點（`packet`）、沒有打字機展開、沒有呼吸閃爍、鏡頭不需要平滑 easing（票 15 才有 `easeCamera`；本票需要鏡頭移動時直接跳到目標位置，不用漸近）。`renderCell` 的簽名已經吃 `frame`／`cam` 參數（票 15 會用到），本票的實作可以先讓 `frame` 不影響輸出（只有票 15 的呼吸／spinner 用得到），`cam` 輸出先算「硬鎖到目標」的值，票 15 再把水平樣式（v1／v4）換成 `easeCamera`。

## 型別

```ts
export type Tone2 =
  | "green" | "greenDim" | "blue" | "violet" | "amber" | "red"
  | "grey" | "greyDim" | "greyDeep" | "white" | "current" | "currentFailed";
export type CellLine = { spans: { text: string; tone: Tone2 }[] };
export type CameraState = { offset: number };

export const renderCell = (
  cell: Cell,
  style: "v1" | "v2" | "v4",
  w: number,
  h: number,
  now: number,
  frame: number,
  cam: CameraState,
): { lines: CellLine[]; cam: CameraState };
```

## Tone2 對照表（DESIGN §2／§3 → `Tone2`；這是唯一的對照來源，`renderCell` 不用表外的顏色邏輯）

| DESIGN 顏色／規則 | `Tone2` | 用在哪 |
|---|---|---|
| 灰 `#8b949e` | `"grey"` | `prompt` 節點名、model 欄、header 的分隔字（` · `、空白） |
| 紫 `#c792ea` | `"violet"` | `think` 節點名、sub cell 的名字（header label） |
| 藍 `#79c0ff` | `"blue"` | 工具節點名、經過時間 |
| 琥珀 `#f2c14e` | `"amber"` | `Agent` 節點名、main cell 的名字（header label） |
| 綠 `#5be49b` | `"green"` | `reply` 節點名 |
| 暗綠 `#2f6a4c` | `"greenDim"` | running cell 邊框（`FLASH_MS` 閃完之後的常態） |
| 白＋淡綠底 | `"current"` | 目前節點（`curIx`，非失敗） |
| 紅（節點失敗時的目前節點） | `"currentFailed"` | 目前節點且 `cell.status === "failed"` |
| 已走過節點名字（灰 m 階） | `"greyDim"` | `steps` 裡 `i < curIx` 的節點名字（符號仍保留種類色——見下方「符號保留種類色」） |
| 紅 `#ff6b6b` | `"red"` | 失敗符號 `✗`、失敗 cell 邊框 |
| 整個 cell 降到極暗灰（DESIGN §3「cell 完成」） | `"greyDeep"` | `cell.status !== "running"` 時，這一整行（header 與方框）除了失敗符號外全部用這個 tone；收合形（`renderStrip`）的非失敗文字同理 |
| 白（current 節點文字本體，非底色） | `"white"` | 只用在票 15 的呼吸／打字機情境；本票的定形 fixture 不會用到（節點一旦定形就不是 current） |

**符號保留種類色**規則（DESIGN §2「已走過的節點：符號 `●` 保留種類色」）只在 `cell.status === "running"` 時生效：這時候，已走過節點的**符號**（`●`）用它原本種類的 tone（`prompt`→grey、`think`→violet、工具→blue、`Agent`→amber、`reply`→green），**名字**才是 `greyDim`。`cell.status !== "running"`（本票 fixture 的常態）時，整行都是 `greyDeep`，符號也不例外——這是「整個 cell 降到極暗灰」蓋過「符號保留種類色」的結果，兩條規則的優先序以本票這句話為準。

## 三種樣式（DESIGN §1 對照 `docs/設計/試衣間.html`）

| `style` | 邏輯依據 | 未收合列數 | 收合形 |
|---|---|---|---|
| `"v1"` | `renderV14`：第 1 列 header rule（含跑馬燈任務名）；第 2–4 列＝橫向方框鏈（top/mid/bot） | 4 | 只剩 header 那 1 列 |
| `"v2"` | `renderV24`：第 1 列 `┌ header ┐`；第 2 列＝跑馬燈任務名；第 3 列起＝直向節點列表，新節點永遠鎖在最底一列（硬鎖，不 ease）；`└...┘` 收尾 | `min(h, 3 + steps 列數 + edge 列數)` | `STRIP_W(=8)` 欄寬的直條（`renderStrip`：`✓／✗ <label>` 一行＋每個 step 名字一行，滿了印 `+N`） |
| `"v4"` | `renderV4`：第 1 列同 v1 的 header rule；第 2 列＝壓成一條鏈的流程（`glyph name ─▸ glyph name …`），跟著 `easeCamera`／硬鎖橫向捲動 | 2 | 只剩 header 那 1 列 |

collapse 的判斷（v1／v4／v2 皆同）：`isCollapsed(cell, now)`（票 10 匯出）為真才收合；`failed`／`killed`／`orphan` 因為 `isCollapsed` 對它們恆假，所以永遠不收合（DESIGN §3「留到點掉」）。

## Header 組成（v1／v4 共用第 1 列；v2 的 `┌ ... ┐` 列用同一份文字，只是包框）

順序固定：`<狀態符號> <名字> [<model>] <經過時間> · <跑馬燈任務名>`。

1. 狀態符號：`running` → `SYMBOLS.spinner[frame % 10]`；`failed`／`killed` → `SYMBOLS.failed`；其餘（`completed`／`orphan`）→ `SYMBOLS.done`（`orphan` 用 `?` 是節點層級符號，不是 header 符號——header 沒有專門的孤兒符號，讀 SDD §2.6a 沒有反例，維持 `✓`／`✗` 兩種）。
2. 名字：`cell.label`；`kind === "main"` 用 `amber`、其餘（`sub`／`bg`）用 `violet`（running 時）；不 running 時整段 tone 見上表覆蓋成 `greyDeep`。
3. `model`：`cell.model` 存在才輸出這個 chunk（含它前面的一個空白）；不存在整段跳過（不留空白洞）。
4. 經過時間：`formatElapsed((cell.endAt ?? now) - cell.firstAt)`。
5. `" · "` 固定分隔。
6. 跑馬燈：`marquee(cell.desc, remainingWidth, now)`，`remainingWidth = w - displayWidth(前面固定部分)`；`remainingWidth <= 0` 時這段是空字串（不會產生負寬度）。

Tone 的整行覆蓋規則：`cell.status !== "running"` 時，第 2–6 段（符號除外，符號另有失敗紅色的特例——`cell.status === "failed"` 時符號仍是 `red`，不被蓋成 `greyDeep`）全部 `greyDeep`；`running` 時各自用上表的 tone。

**測法**：exact 測試只逐字驗「這一行 spans 串接後的純文字＝預期字串」與「每個 span 的 tone 屬於預期集合」，**不鎖 spans 陣列的切法**（合併相鄰同 tone 的 span 是合法實作選擇）。

## 方框鏈（v1 的第 2–4 列）

單一節點時（無 edge）：`top = "┌" + "─"*10 + "┐"`（12 欄）；`mid = "│" + glyph(1) + " " + pad(fit(name, NODE_W-4), NODE_W-4) + "│"`（12 欄，`NODE_W-4=8`）；`bot = "└" + "─"*10 + "┘"`。多節點時，節點間插入 `EDGE_W(=4)` 欄的間隔：`top`／`bot` 補 4 個空白，`mid` 補 `edgeDash*3 + edgeArrow`（定形時，無光點）。整條 strip 寬度 `stripW = steps.length * NODE_W + (steps.length - 1) * EDGE_W`；`stripW > 可用寬度` 時用水平位移（本票直接跳到 `cameraTarget` 等效的硬鎖位置：右緣對齊最新節點；票 15 換成 `easeCamera`）。方框內容不足 `w` 時剩餘欄位補空白，補到的欄位不超過 `w`（I4：`≤`，不必補到恰好等於 `w`）。

## v2 直向列表

節點列格式：`" " + glyph + " " + pad(fit(name, 10), 10) + pad(fit(detail, inner-22), inner-22) + pad(elapsed, 7)`（`inner = w - 2`）；節點間一列 `" │"`（定形，無光點）。硬鎖：`body = h - 3`（扣 header、desc 列、下邊框）；`offset = max(0, rows.length - body)`，直接取 `rows.slice(offset)` 顯示在框內，**不 ease**（縱向永遠是硬貼齊，這是 v2 跟 v1／v4 唯一的鏡頭差異，DESIGN §1「鏡頭」段最後一句）。

## main 歷史合併列（獨立於 `renderCell` 的小函式，避免硬把「合併後的假 cell」塞進 `Cell` 型別）

```ts
export const renderMainHistory = (count: number, recentDesc: string, w: number): CellLine;
```

輸出一行：`✓ ${count} turns · ${fit(recentDesc, remainingWidth)}`，`done` 符號固定 `greyDeep`（合併列一律是完成態，DESIGN §2.6260「main 歷史合併」語意上永遠是已完成的）。呼叫端（票 13 的 agents 面板／票 16 的 `band.tsx`）負責判斷「這是不是該顯示合併列而不是逐輪 cell」，本票只給格式化函式。

## 收合形（v1／v4／v2 各一測）

- v1／v4：`[headerLine]`（跟未收合時同一份 header 組成邏輯，唯一差別是不印方框／鏈）。
- v2：`renderStrip(cell, h): CellLine[]`（獨立匯出，`renderCell(cell,"v2",w,h,now,frame,cam)` 在 `isCollapsed` 時內部呼叫它）。第 1 行 `<✓/✗ tone> <fit(label, STRIP_W-2)>`；接著每個 step 名字一行（`fit` 到 `STRIP_W-2`，`greyDim` tone，失敗符號紅、其餘 `greyDeep`）；超過 `h-1` 行時最後一行印 `"+N"`；不足 `h` 行補空白行（每行 `displayWidth === STRIP_W`）。

## 符號表測試（票 10 的 `SYMBOLS` 是唯一來源）

任何 `renderCell` 輸出的每個字元，只能是：`SYMBOLS` 物件裡的某個值（逐字元比對，`spinner` 拆開算 10 個候選字元）、方框字元（已含在 `SYMBOLS`）、ASCII 可列印字元（含空白）、或 cell 的 `label`／`desc`／`model`／step `name`／`detail` 本文包含的字元（含中文）。測試法：跑一批隨機 cell（見下方 property），把所有輸出字元收集起來，逐一檢查「屬於 `SYMBOLS` 的某個值，或屬於 ASCII 可印字元，或出現在輸入文字裡」。

## Property 測試（I4；隨機生成，固定 seed，不裝 fast-check）

隨機生成 cell：`steps.length` 1–64、每個 step 名字長度 1–30（含中文，跟 `marquee` 的中文案例一樣用固定字元池）、`w` 20–200、`h` 2–40、三種 `style` 都跑。斷言：`renderCell(...).lines` 每一行 `displayWidth(line 的純文字) <= w`；`lines.length <= h`。

## Fixture（逐列 exact；`docs/設計/試衣間.html` 的模擬狀態當參考，但本票用可手算的簡化版本，複雜的多節點／捲動／running 狀態留 `test.todo` 給實作對照 試衣間.html 現場核對——見骨架檔）

固定 fixture cell（單一 `prompt` step、`status: "completed"`、`firstAt: 0`、`endAt: 500`、`model` 缺省）：

- `w=30` 的 v1：header `"✓ main 0s · hello"` 補空白到 30 欄（`main` amber 於 running 時，這裡 `greyDeep`；顯示文字見骨架測試）；方框 3 列各 `displayWidth <= 30`，內容 `"┌──────────┐"` / `"│● prompt  │"` / `"└──────────┘"`（皆 `greyDeep`）。
- `w=30` 的 v4：同一 header；第 2 列 `" ● prompt"` 補空白到 `<=30`。
- `w=20,h=5` 的 v2：`┌ ✓ main 0s ...┐`／marquee(desc) 列／`│ ● prompt ...│`／`└...┘`，每行 `<=20`（見骨架測試對「以 prefix 驗證」的說明，完整右邊框對齊留給實作對照試衣間.html）。

## 突變（寫進 `tests/突變/14-renderCell.json`）

1. label `renderCell: a line is allowed to overflow w (I4 broken)` — 拿掉 `fit`／截斷，直接輸出過長字串。
   `file`: `plugins/telltale/hooks/cells.ts`
   `old`: `pad(fit(name, NODE_W - 4), NODE_W - 4)`
   `new`: `name`
2. label `renderCell: finished cell keeps kind-tones instead of greyDeep` — 「整個 cell 降到極暗灰」失效。
   `old`: `cell.status !== "running" ? "greyDeep" : `
   `new`: `false ? "greyDeep" : `
3. label `renderStrip: overflow count is silently dropped` — 超過 `h-1` 行時不印 `+N`。
   `old`: `out.push(\`+${names.length - shown.length}\`)`
   `new`: `void names;`
4. label `renderMainHistory: turn count not shown` — 合併列漏掉 `count`。
   `old`: `\`✓ ${count} turns · \``
   `new`: `\`✓ turns · \``
