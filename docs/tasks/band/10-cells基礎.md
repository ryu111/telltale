# 10-cells 基礎：`hooks/cells.ts` 的純函式底座（時間、跑馬燈、排序、符號表）

- 對應 SDD 節次：§1.1a（`Step`／`Cell` 型別、時間常數具名 export）、§2.6260（`… +N more`、summary 段落格式）、§2.6a（`STEPS_MAX`）；不變量 I14（v0.2，依 §1.1a 改寫後套用在 `renderCell` 身上，見下方「與 SDD 的落差」）、I15（v0.2）
- 可碰檔案：`plugins/telltale/hooks/cells.ts`（新檔）、`tests/突變/10-cells基礎.json`
- 相關檔案：`docs/SDD.md`（§1.1a、§2.6、§2.6a）、`docs/DESIGN.md`（§2 顏色表、§3 動態表的時間常數、§5 最後一段常數清單）、`docs/設計/試衣間.html` `<script>`（`elapsed`、`marquee`、`SPIN` 陣列——只抄邏輯，不抄 HTML／CSS class）、`plugins/telltale/hooks/width.ts`（`displayWidth`／`fit`，本票直接 import 使用，不重寫）、`docs/tasks/band/00-共同規則.md`
- 驗收測試：`tests/hooks/cells.test.ts`
- 完成條件：`make check` 全綠；驗收測試由紅轉綠；`make mutate` 對本票四條突變全紅；code-review Spec 軸零缺漏、零超範圍
- 依賴（Blocked by）：無（v0.2 系列的地基）
- 並行度：**不能**與 11、14、15 同時（四票可碰檔案都含 `plugins/telltale/hooks/cells.ts`，必須依序 10 → 14 → 15；11 可與 10 同時起步但兩者都不碰同一檔所以互不衝突，仍建議依序做以降低合併成本）

## 與 SDD 的落差（照 00-共同規則「票與 SDD 衝突以 SDD 為準並回報」處理）

SDD §5 的 I14（v0.2）字面寫「`composeLive` 輸出的 `displayWidth ≤ columns`」，但 §1.1a 已經淘汰 `composeLive`（挑毛病後改寫「只有一套呈現模型」，唯一輸出管道是 `renderCell`）。這是 SDD 改寫時漏改的殘留字，不是兩種設計並存。本票與票 14 一律把 I14 讀成「`renderCell` 輸出的每一行 `displayWidth ≤ w`」；票 14 的驗收測試即以此為準。實作或審查發現這條看法有誤，回報 `stuck`，不要自己另外造一個 `composeLive`。

## 題目

新增 `plugins/telltale/hooks/cells.ts`：純函式檔（不 import `claude-code`、不碰 `$`），只准 import `./width`（`displayWidth`、`fit`）。

### 型別（SDD §1.1a 原文照抄）

```ts
export type Step = { name: string; detail?: string; t0: number; t1?: number };
export type Cell = {
  id: string; kind: "main" | "sub" | "bg"; label: string; model?: string; desc: string;
  status: "running" | "completed" | "failed" | "killed" | "orphan";
  firstAt: number; endAt?: number; updatedAt: number;
  steps: Step[];
  dismissed?: true;
};
```

### 時間常數（全部具名 export，DESIGN §5 的文件化來源）

```ts
export const TRANSIT_MS = 600;
export const BIRTH_MS = 400;
export const BREATHE_MS = 600;
export const SLIDE_MS = 500;
export const COLLAPSE_AFTER_MS = 3000;
export const VANISH_AFTER_MS = 60_000;
export const FLASH_MS = 1000;
export const CAMERA_MARGIN = 28;
export const CAMERA_GAIN = 0.25;
export const MARQUEE_STEP_MS = 300;
export const STEPS_MAX = 64;
export const LONG_RUN_MS = 30 * 60 * 1000;   // 用乘法算出來，不寫第二個數字
export const ORPHAN_MS = 2 * 60 * 60 * 1000; // 同上
export const NODE_W = 12;
export const EDGE_W = 4;
export const STRIP_W = 8;
```

### 符號表（DESIGN §2／§3 全部符號的唯一來源；票 14 的「符號表測試」就是拿這個物件當白名單）

```ts
export const SYMBOLS = {
  current: "◉",       // 目前節點（running，呼吸中）
  walked: "●",         // 已走過的節點
  pending: "·",        // 還沒抵達的節點佔位
  packet: "◆",         // 光點
  packetTail: "·",     // 光點尾巴（與 pending 同字元，DESIGN §3 用同一個符號）
  done: "✓",           // cell／main 歷史 完成
  failed: "✗",         // cell 或節點失敗
  orphan: "?",          // 背景任務孤兒
  edgeDash: "─",
  edgeArrow: "▸",
  boxTL: "┌", boxTR: "┐", boxBL: "└", boxBR: "┘", boxV: "│",
  spinner: "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏", // running cell 標題符號；renderCell 用 spinner[frame % spinner.length]
  ellipsis: "…",
  moreSep: " +",       // "… +N more" 的前綴（配合 fitCells）
} as const;
```

### `formatElapsed(ms: number): string`

四段：`< 60s` → `${s}s`；`< 60m` → `${m}m` 沒有零頭秒數時不印秒（`${m}m${ss}`，`ss` 兩位數補零，只在餘數 > 0 時附加）；`< 60h`（其實是「分鐘數 ≥ 60」）同理用 `h` 段。**四個字面例子鎖進測試**（票面給的例子本身就是規格）：

| ms | 結果 |
|---|---|
| `12_000` | `"12s"` |
| `64_000` | `"1m04"` |
| `720_000` | `"12m"` |
| `3_720_000` | `"1h02"` |

負數或 0 视为 `0s`（`Math.max(0, …)`）。

### `marquee(text: string, w: number, now: number): string`

`displayWidth(text) <= w` 時直接靠左 pad 到 `w`（空白補右邊）。放不下時：迴圈字串 `` `${text}   ·   ` ``（3 空白 + `·` + 3 空白），依 `Math.floor(now / MARQUEE_STEP_MS)` 對迴圈總寬度取模決定捲動偏移，取一個寬度 `w` 的視窗（wide char 算 2，跟 `width.ts` 一致），輸出恰好 `displayWidth === w`。三個案例都要測：放得下（`pad` 原樣）、放不下（視窗滾動且同一秒內位置不變、跨 `MARQUEE_STEP_MS` 位置變）、含中文（wide 字元算 2，视窗边界不切半个字）。

### `sortCells(cells: readonly Cell[]): Cell[]`

不修改輸入（回傳新陣列）。排序鍵：`status === "running"` 優先（true 排前面）→ `firstAt` 升冪 → `id` 字典序升冪。純比較函式，跟輸入順序無關（I15 的「排序穩定」＝這三個鍵完全決定順序，不依賴陣列原始順序）。

### `fitCells(cells: readonly Cell[], budget: number): { shown: Cell[]; hidden: Cell[] }`

**`budget` 是「最多顯示幾個 cell」的數量上限，不是列數或欄寬**（列數/欄寬的取捨留給票 16 `band.tsx` 用 `renderCell` 每個 cell 實際吃掉的列數去算，`fitCells` 只做粗篩）。內部先 `sortCells`，再 `slice(0, budget)` / `slice(budget)`。`budget <= 0` 時 `shown: []`、`hidden` 是排序後的全部。

### `isCollapsed(cell: Cell, now: number): boolean`

`cell.status === "completed" && cell.endAt !== undefined && now - cell.endAt > COLLAPSE_AFTER_MS`。**只有 `completed` 會自動收合**（failed／killed／orphan 依 DESIGN §3「留到點掉」，不受這個函式管）。

### `isVanished(cell: Cell, now: number): boolean`

`cell.status === "completed" && cell.endAt !== undefined && now - cell.endAt > VANISH_AFTER_MS`。同樣只管 `completed`。

### `compressSteps(steps: readonly Step[]): Step[]`

SDD §1.1a：「`steps` 最多 `STEPS_MAX = 64`，超過在**儲存層**把最舊的合併成一個 `{ name: "… ×N" }`」。這是存進 `agents.cells` **之前**跑的壓縮，不是 `renderCell` 的事（票 13 agents 面板的 poll 要呼叫它；票 13 的票面已經預告「等票 10 落地後從這裡 import」，這是那個技術債的還款處，本票的匯出名稱就是票 13 之後要 import 的那個）。

`steps.length <= STEPS_MAX` 原樣回傳（新陣列，不共用引用也可以，但不強制）。超過時：保留最新的 `STEPS_MAX - 1` 個 step 不動，把最舊的 `steps.length - (STEPS_MAX - 1)` 個合併成 1 個 `{ name: `… ×${合併數}`, t0: 最舊那個的 t0, t1: 被合併的最後一個的 t1 }`（`t1` 若最後一個沒有 `t1` 就整段不設 `t1`），拼在最前面，輸出總長度恰好 `STEPS_MAX`。重複呼叫（已經是 `… ×N` 開頭的 step 又被捲進下一輪合併）要把 `N` 累加，不是巢狀出現 `… ×2 ×3`（用正則 `/^… ×(\d+)$/` 判斷第一個 step 是不是已經是合併節點，是的話這次新併入的數量要加上原本的 `N`，`name` 還是只有一個 `… ×總數`）。

## 突變（寫進 `tests/突變/10-cells基礎.json`）

1. label `elapsed: exact-minute keeps a spurious :00` — 破壞「餘數為 0 不印秒」規則。
   `file`: `plugins/telltale/hooks/cells.ts`
   `old`: `String(seconds).padStart(2, "0")`
   `new`: `String(seconds || 1).padStart(2, "0")`
2. label `marquee: offset frozen, does not scroll` — 讓跑馬燈停在原地。
   `old`: `Math.floor(now / MARQUEE_STEP_MS)`
   `new`: `Math.floor(0 / MARQUEE_STEP_MS)`
3. label `sortCells: running no longer sorts first` — running 優先失效。
   `old`: `a.status === "running" ? 0 : 1`
   `new`: `1`
4. label `fitCells: off-by-one leaks one extra cell into shown` — budget 邊界算錯。
   `old`: `sorted.slice(0, budget)`
   `new`: `sorted.slice(0, budget + 1)`
