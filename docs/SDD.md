# SDD：telltale

> 定義是你對這個系統唯一的控制權。程式碼可以不看，這份不能不看。
> 題目原文（使用者交付的規格）在 `docs/題目.md`；本檔是把它對照 2.1.267 的型別檔之後定下來的版本，**衝突處以本檔為準**，衝突清單在 §0。

## 0. 與題目衝突的事實（對照 `.claude/types/claude-code.d.ts`，Claude Code 2.1.267）

| 題目說 | 型別檔／實測說 | 本檔的決定 |
|---|---|---|
| `claude plugin test <dir>` 全過 | 子指令不存在（帶旗標也沒有；npm latest 2.1.274 的 changelog 也沒提） | DoD #2 改成 `bun test hooks/` 連跑兩次 0 fail，harness 自建（§4） |
| 一律用 `e.props.bodyColumns` | `AbovePrompt` 的 props 只有 `hasSurvey`、`isWorking`、`maxRows`、`scroll`；`bodyColumns` 是 `Pane` 的 | 寬度由 `Client` 的 `surface.columns` 決定（region 實際排版後的欄數，resize 會再呼叫一次）；hooks module 只算高度、不算寬度（§1.5） |
| `Client module="./chart.tsx"` 字面值路徑 | `hooks.json` 多一個 `"surface": "band.tsx"`（相對 hooks.json 的單一路徑），`Client` 的 `module` 是那個檔的**export 名** | `hooks.json = { modules: ["register.tsx"], surface: "band.tsx" }`，`<Client key="band" module="Band" props={…} />`（`key` 是樹上的位址、`module` 是 export 名，兩個字串刻意不同） |
| `ClientElements` 少 `Raster` | `Omit<Elements['terminal'], 'Client'>`；整份型別檔沒有 `Raster` | 不提 Raster |
| `userConfig` 欄位 `kind`／`label`；每欄自動變 `/config` 一列 | 官方文件：欄位是 `type`／`title`／`description`；`/config` 列要 **v2.1.269+**，本機 2.1.267 沒有 | 面板開關的真值放 `$.store`，由 `/telltale` 改；`userConfig` 只留 `default` 當第一次的種子。詳 §2.4 |
| `$.store` 上限「全部加起來」（句子截斷） | 4 MiB JSON 文字；實體在 `~/.claude/plugins/store/`，跨 session、跨熱重載保留 | 不變量 I5；卸載見 §2.5 |
| 型別檔約 10,900 行 | 8,752 行 | 無影響 |

沒衝突、但題目沒寫而型別檔有寫的：
- `ui.render` **每個輸入值只跑一次**（props、viewport 寬度、plugin 載入、`$.ui.invalidate("ui.render")`）；repaint 重用答案。資料更新後要自己 `invalidate`，每秒最多十次。
- `e.viewport` 是 **optional**（「Absent where no surface has measured」）。任何讀它的地方都要 `e.viewport?.columns ?? 80`。
- `ClientSurface.every` 要在 `state` 還是 `undefined` 時啟動一次，不能每次繪製都啟動。
- `Client` 超時或 throw 會**卸載該實例**並畫一行錯誤，不是整條帶消失。
- `command.register` 的 `name` 只准 `[A-Za-z0-9_-]{1,64}`。
- `$.store` 是 plugin 層級、跨 session 共用（同一個人所有 session 看到同一份）。

## 穩定層（先定，定完盡量不動）

### 1. 介面

#### 1.1 面板（`hooks/panels/*.ts`）：純資料＋純函式，拿不到 `$`、拿不到 surface

```ts
export type Tone = "up" | "down" | "flat" | "dim";

export type PanelLine = {
  text: string;      // 顯示寬度（東亞寬字算 2）≤ 給定 columns；不含 \n、\t、控制字元
  tone?: Tone;
};

export type PanelView = {
  id: string;
  lines: PanelLine[];   // 長度 ≤ 給定 rows
};

export type PanelIo = {
  now: () => number;    // 框架給 `() => $.clock.now()`（包一層箭頭函式，不直接傳 $.clock.now）
  // v0.1 沒有面板需要 fetch，先不宣告。加進來的那天 validate 的 calls: 會多 $.http.fetch，要同時改 README。
};

export type Panel<D = unknown> = {
  id: string;            // ^[a-z][a-z0-9-]{0,15}$；$.store 鍵、/telltale 參數、userConfig 鍵的尾段
  label: string;         // 面板標題列與 /telltale status 顯示用
  defaultOn: boolean;
  minRows: number;       // ≥ 1
  wantRows: number;      // ≥ minRows
  everyMs?: number;      // 有 poll 才有；≥ 1000
  poll?: (io: PanelIo) => Promise<D>;   // 回傳值會 JSON round-trip 後進 $.store
  view: (data: D | undefined, columns: number, rows: number) => PanelView;  // 純函式
};
```

`view` 的契約（測試直接打）：
- 同樣的 `(data, columns, rows)` 給同樣的輸出（沒有 `Date.now()`、沒有隨機）。
- `data === undefined`（還沒 poll 過、或 store 讀不到）**要畫**，畫成明顯的「尚無資料」。
- 框架保證呼叫時 `columns ≥ MIN_COLUMNS (=20)`、`rows ≥ minRows`；面板在這個範圍內**一定要回內容**，不回 `null`（型別上就沒有 null）。寬度不夠就裁，不是消失——「面板因寬度消失」不存在，只有「因高度 dropped」（§1.2）。
- 輸出的每一行 `displayWidth(text) ≤ columns`、`lines.length ≤ rows`；超出是面板的 bug，框架**不補救**，測試會抓。

#### 1.2 版面調度（`hooks/layout.ts`）：框架核心，純函式，只管高度

```ts
export const BAND_ROWS_MAX = 9;          // 唯一來源；標題 1 + 內容 + 狀態 1
export const FIXED_ROWS = 2;             // 標題列 + 狀態列
export const CONTENT_ROWS_MAX = BAND_ROWS_MAX - FIXED_ROWS;   // 不另寫數字
export const MIN_COLUMNS = 20;           // 窄於這個，整條帶只畫一列（§1.5）

export type Want = { id: string; minRows: number; wantRows: number };
export type Slot = { id: string; rows: number };
export type Layout = { slots: Slot[]; dropped: string[]; total: number };

export const layout = (panels: readonly Want[], maxRows: number): Layout;
```

規則（每條都有測試與突變）：
1. `budget = min(maxRows, BAND_ROWS_MAX) - FIXED_ROWS`，**算一次、是常數**，不隨分配遞減後重判。
2. `budget < 1`（含 `maxRows ≤ FIXED_ROWS`、`maxRows ≤ 0`）：`slots = []`、全部進 `dropped`、`total = max(1, min(maxRows, FIXED_ROWS))`。`total === 1` 時 band 把標題與狀態合併成一列（§1.5）。
3. 依 `panels` 順序，每個面板先拿 `minRows`（從 `budget` 扣）；扣不起的整個進 `dropped`，**不畫半個**，繼續看下一個（後面較小的面板仍可能塞進去）。
4. 第一輪分完剩下的列，再依順序補到各面板的 `wantRows` 為止；補不完就留白（`total` 可以小於上限，用 `≤` 不用 `=`）。
5. `total = FIXED_ROWS + Σ slots.rows ≤ min(maxRows, BAND_ROWS_MAX)`（規則 2 的情況除外，那時 `total ≤ FIXED_ROWS`）。
6. 輸出確定：同輸入同輸出；`slots` 順序 = 輸入順序；`dropped` 順序 = 輸入順序。
7. `layout` **不吃 columns**：寬度改變永遠不改變高度。帶子高度只在「maxRows 變」或「開關變」時變（回答使用者「resize 時高度跳動」的顧慮）。

預設狀態的高度（v0.1，只有 hello 開著）：`FIXED_ROWS + hello.wantRows = 2 + 2 = 4` 列，寫進 README。

#### 1.3 顯示寬度（`hooks/width.ts`）：純函式

```ts
export const displayWidth = (s: string): number;          // 東亞寬字（W／F）算 2，其餘 1；控制字元算 0
export const fit = (s: string, columns: number): string;   // displayWidth(s) ≤ columns → 原樣回傳（一個字都不動）；否則裁到 ≤ columns，尾端補 "…"（算 1 欄）
```

`fit` 的兩邊都測：不該裁的不能裁（下界，擋「永遠多砍幾欄」的偷懶）、該裁的裁到剛好（上界）。

寬字表：CJK 統一漢字、假名、諺文、全形 ASCII、CJK 標點與符號（U+1100–115F、U+2E80–A4CF、U+AC00–D7A3、U+F900–FAFF、U+FE30–FE4F、U+FF00–FF60、U+FFE0–FFE6、U+20000–2FFFD、U+30000–3FFFD）。emoji 不保證（v0.1 不做，README 寫明）。

#### 1.4 hooks module（`hooks/register.tsx`）：唯一碰 `$` 的地方

```ts
export const register: Register = (on, options) => {
  on("session.start", …)                                  // 讀 $.store 種子、註冊 /telltale、啟動各面板的 $.clock.every
  on("ui.render", { component: "AbovePrompt" }, …)        // 見 §3 Pipeline
  on("ui.message", …)                                     // Client post 進來的點擊：{ kind: "toggle", id }
  on("command.run", { command: "telltale" }, …)
};
```

允許的 `$` 呼叫（validate 的 `calls:` 一行要**恰好**是這些）：`$.ui.resolve`、`$.ui.invalidate`、`$.clock.now`、`$.clock.every`、`$.store.get`、`$.store.set`、`$.command.register`。`$.env.get` 本輪沒有用到就不宣告（題目允許但 YAGNI）。每一個宣告的 op 在流程測試裡都要**真的被呼叫到至少一次**（fakeEngine 計數），擋「宣告了但沒接線」。

#### 1.5 surface module（`hooks/band.tsx`）：畫＋滑鼠，跑在繪製執行緒

```ts
export type BandPanel = { id: string; label: string; rows: number; lines: PanelLine[]; at: number | null; error: string | null };
export type BandProps = {                      // hooks module 傳給 Client 的 props（JsonValue，不能有 undefined）
  columnsHint: number;                         // e.viewport?.columns ?? 80；只當 surface.columns === 0（還沒排版）時用
  total: number;                               // layout().total
  panels: BandPanel[];                         // 已經 layout 過、順序就是畫的順序
  dropped: string[];
  now: number;                                 // hooks module 的 $.clock.now()，狀態列算「Xs ago」用
};
export type BandState = { down: { x: number; y: number } | null };
export function Band(props: BandProps, surface: ClientSurface<BandState>): RenderElement;
```

畫法：
- `columns = surface.columns || props.columnsHint`。
- `columns < MIN_COLUMNS`：整條帶只畫一列 `fit("telltale · " + n + " panels", columns)`，不畫面板（不是消失，是降級）。
- `props.panels.length === 0`（全部關掉，挑毛病 Q4）：只畫一列 `telltale · all panels off · /telltale on`；hooks module 這時 `total = 1`（layout 的 wants 為空時回 `{ slots: [], dropped: [], total: 1 }`，規則 2 的特例，測試守）。
- `props.total === 1`：標題與狀態合併成一列。
- 第 1 列（標題列）：`fit(text, columns - TITLE_RESERVE)`，`TITLE_RESERVE = 4` = 引擎 `[-]` 蓋掉的 3 欄 + 1 欄緩衝（**兩個數字都寫成常數並註解，別「修正」成 3**）。最右 4 欄留白。
- 每個面板：一列標題 `─ label ─────`（用 `─` 補到 columns），然後 `lines`，每行 `fit(text, columns)`。
- 末列（狀態列）：`dropped` 非空 → `⋯ git, trace not shown (height)`；有面板 `error` → `hello: data too large`；否則 `updated Ns ago`，N = `now - max(panels[].at)`（顯示中最新的那個）。
- `tone` → 顏色：`up` 綠、`down` 紅、`flat` 預設色、`dim` dimColor。只表達嚴重度，不閃、不加粗（題目 §7.4）。
- **每次呼叫都重掛 `surface.onPointer`**（回呼裡只讀 `surface.state`、不讀閉包）。點擊 = `down` 後同一格 `up`；落在某面板標題列且 `x < columns - TITLE_RESERVE` → `surface.post({ kind: "toggle", id })`。最右 4 欄是死區（README 寫明）。hover 不做。
- **這個檔的輸出沒有自動測試守著**（Client 在繪製執行緒）；命中判定 `hitPanel(y, panels): string | null` 抽到 `hooks/hit.ts` 純函式去測（列數從 `props.total` 與各 `rows` 算，跟畫的用同一個函式 `rowsOf(props)`，不許兩份）。

#### 1.6 `/telltale` command

| 輸入 | 輸出 `text` |
|---|---|
| `/telltale`、`/telltale status` | 每面板一行：`● hello  on   2 rows` / `○ git  off` / `⋯ trace  on  dropped (height)`；末行 `band: N rows of M available` |
| `/telltale <id>` | 切換該面板，回 `hello: on → off` |
| `/telltale <id> on`／`off` | 設定；已經是該狀態回 `hello: on (unchanged)` |
| `/telltale on`／`off` | 全部面板，一面板一行同上格式 |
| `/telltale help`、或任何不合語法的輸入（第三個 token、`on`/`off` 以外的第二個 token） | `usage: /telltale [status|help|on|off|<panel> [on|off]]  panels: hello` |
| 未知 id | `unknown panel "x"; known: hello`（不猜、不模糊比對） |

### 2. 資料模型

#### 2.1 `$.store` 鍵（plugin 內唯一持久狀態；表是完備的，實作不准多加鍵）

| 鍵 | 值 | 誰寫 | 誰清 |
|---|---|---|---|
| `panels` | `{ [id]: boolean }` 面板開關 | `session.start`（缺的 id 用種子補）、`command.run`、`ui.message` | 不清 |
| `data.<id>` | `{ at: number; data: unknown }` 面板最近一次成功 poll 的結果 | 該面板的 `$.clock.every` 回呼 | 不清（下次成功覆蓋） |
| `error.<id>` | `string`，最近一次 poll 的錯誤（`"data too large"`、或 exception 的 message） | 同上 | 下一次成功 poll 時寫 `""`（不用 `$.store.delete`，免得 `calls:` 多一個 op） |

`panels` 是**同一個人所有 session 共用**（§0 最後一條）：在 session A 關掉，session B 下一次 render 也會少那塊。這是 /config 一樣的語意，README 寫明；不做 per-session（挑毛病 Q2 已定）。

寫 `data.<id>` 沒有原子性；多 session 同時 poll 只會重複寫同一種值，無害（I6）。

#### 2.2 面板註冊表（`hooks/panels/index.ts`）

`export const PANELS: readonly Panel[] = [hello, clock]`，順序就是畫的順序。id 不可重複（測試守）。兩個面板是為了讓 DoD #3 與切片 6「點第二個、第一個不動」驗得到（挑毛病 Q1）。

#### 2.2a clock 面板（`hooks/panels/clock.ts`）

- `id: "clock"`, `label: "clock"`, `minRows: 1`, `wantRows: 1`, `everyMs: 1000`, `defaultOn: true`
- `poll`: 回 `{ now: io.now() }`。
- `view`: 一行 `HH:MM:SS`（本機時區）；`data` 為 undefined 時 `--:--:--`（看得見的記號，不留白）。無 tone。
- 用途：零依賴、每秒變，證明兩個面板的 poll 週期與開關互不干擾。

#### 2.3 hello 面板（`hooks/panels/hello.ts`）

- `id: "hello"`, `label: "hello"`, `minRows: 1`, `wantRows: 2`, `everyMs: 5000`
- `poll`: 回 `{ tick: io.now() }`（poll 拿不到上一次的值，所以不做計數器）。
- `view`: 第 1 行 `hello · <HH:MM:SS of tick>`；第 2 行（有第 2 列時）`寬 W 欄 · 高 R 列`（故意放中文，讓寬度計算有真實案例）。`data` 為 undefined 時第 1 行是 `hello · waiting for first tick`（tone `dim`）。tone 示範（挑毛病 Q3）：第 1 行依 tick 的秒數奇偶給 `up`／`flat`，第 2 行固定 `dim`；`down` 只在 band.tsx 的對應表裡，hello 不用。

#### 2.4 面板開關為什麼不用 `userConfig`

2.1.267 的 `userConfig` 只在 enable 時提示一次、`/config` 列要 2.1.269+；而且改 `userConfig` 會**重載整個 module**（題目 §3.5 實測）。開關放 `$.store` 就沒有重載：關掉一個面板只是下一次 render 少畫一塊，DoD #3 直接成立。`plugin.json` 仍宣告 `panel.hello`（`type: "boolean"`, `default: true`）：`session.start` 時 `panels` 鍵缺該 id 才拿 `options["panel.hello"]` 當種子，之後以 store 為準。

#### 2.5 安裝、開發、卸載（README 要寫的）

- 開發：`--plugin-dir`；正式：`claude plugin install`（marketplace）或放 `~/.claude/skills/telltale/`。同名時 `--plugin-dir` 優先。
- 卸載：`claude plugin uninstall telltale` 刪 `${CLAUDE_PLUGIN_DATA}`，但 **`$.store` 的檔（`~/.claude/plugins/store/`）官方文件沒說會刪**——README 寫清楚檔案位置與一行清除指令。plugin 自己不做「卸載時清 store」（沒有這種事件）。

### 3. Pipeline（產品的執行流程）

```
session.start
  ├─ panels ← $.store.get("panels") ⊕ 缺的用 options["panel.<id>"] ?? defaultOn 補 → $.store.set
  ├─ $.command.register({ name: "telltale", description, argumentHint: "[status|help|on|off|<panel> [on|off]]" })
  └─ 每個有 poll 的面板：tick = async () => {
         try {
           data ← await panel.poll({ now: () => $.clock.now() })
           json = JSON.stringify(data); json.length > DATA_MAX_BYTES(64 KiB) → throw "data too large"
           $.store.set(`data.${id}`, { at: $.clock.now(), data }); $.store.set(`error.${id}`, "")
         } catch (err) { $.store.set(`error.${id}`, String(err)) }
         $.ui.invalidate("ui.render")
     }; tick() 先跑一次；$.clock.every(everyMs, tick)

ui.render{AbovePrompt}
  ├─ e.props.hasSurvey → return next(e)                    （讓位）
  ├─ wants ← PANELS.filter(panels[id]) 的 {id,minRows,wantRows}
  ├─ { slots, dropped, total } ← layout(wants, e.props.maxRows)
  ├─ columnsForView ← max(MIN_COLUMNS, e.viewport?.columns ?? 80)   ← view 只用它裁**內容**；Band 再用 surface.columns 裁一次，所以就算這個值偏大也不會溢出（I4 守的是 Band 那一層）
  ├─ 每個 slot：cached ← $.store.get(`data.${id}`)；error ← $.store.get(`error.${id}`)
  │            lines ← panel.view(cached?.data, columnsForView, slot.rows).lines
  └─ return <Client key="band" module="Band" props={{ columnsHint, total, panels, dropped, now }} />

Band(props, surface)                                        （繪製執行緒，§1.5）

ui.message{ kind:"toggle" } / command.run{telltale}
  └─ panels[id] 翻轉 → $.store.set("panels") → $.ui.invalidate("ui.render")；command 回 { text }
```

停止條件：`$.clock.every` 隨 module 卸載停；沒有其他迴圈。

### 4. 測試 harness（取代不存在的 `claude plugin test`）

`hooks/harness.ts`：

```ts
export const fakeEngine = (opts?: { store?: Record<string, unknown>; now?: number; options?: PluginOptions }) => ({
  $,                 // ui.resolve 回 h-tag 建構子表；ui.invalidate 計數；clock.now 回 opts.now；clock.every 記下 (ms, fn) 讓測試手動 tick；store 讀寫 opts.store（走 JSON round-trip）；command.register 記名
  on,                // 收 register 註冊的 handler，依 (event, matcher) 存
  fire(event, e),    // 呼叫對應 handler，next(e) 回 { text:"" } 或 null 樹
  calls: Record<string, number>,   // 每個 $.noun.method 被呼叫的次數（守 §1.4「都要真的被呼叫」）
});
```

跑法：`bun test hooks/`（bun 讀 `.tsx`、`jsxFactory: h` 由 `tsconfig.json` 給）。`clientOf(tree)` 走樹找 `type === "Client"` 的節點，斷言它的 `props`。

**Client 內部畫的東西測不到**：`band.tsx` 只靠 `hit.ts`、`width.ts` 的純函式測試 + §5.3 tmux 實測。**I7（不重載）與 DoD #3 只有 tmux 實測算數**，fakeEngine 本來就不會重載，它的測試不能拿來當 DoD #3 的證據。

### 5. 不變量（不管怎麼實作都不能違反）

| # | 不變量 | 守它的機制 |
|---|---|---|
| I1 | `validate --strict` exit 0，`calls:` 恰好 = §1.4 那七個 | `make check` 跑 validate 並 diff 那一行；每個 op 在流程測試裡 `calls[op] ≥ 1` |
| I2 | `layout()` 的 `total ≤ min(maxRows, BAND_ROWS_MAX)`，且每個 slot `rows ≥ minRows` | 單元測試（含 budget<1、混合 dropped、`maxRows=1`、`maxRows=0`）+ 突變 `Math.min(maxRows, BAND_ROWS_MAX)` → `maxRows` |
| I3 | 被砍的面板出現在 `dropped`，且狀態列印出來 | 單元測試 + 突變 `dropped` 清空 |
| I4 | 傳給 `Client` 的每一行 `displayWidth ≤ columns`；中文算 2；**而且** `displayWidth ≤ columns` 的字串 `fit` 後原樣 | 單元測試（columns 30 塞中文；恰好等寬的不動）+ 突變 `wide ? 2 : 1` → `1`、`fit` 多扣 1 |
| I5 | `$.store` 總量 < 4 MiB：`data.<id>` 寫入前 `JSON.stringify` 長度 > 64 KiB 就不寫、寫 `error.<id>`；下次成功就清 | 流程測試用假面板回 70 KiB 走過這條路徑（不是只測工具函式） |
| I6 | 重複 poll 無害：同一 `data.<id>` 寫兩次結果一樣 | hello 的 poll 是純的；規約寫在 Panel 契約 |
| I7 | 開關切換不重載 | **tmux 實測**（切片 6）：切換前後 debug log 沒有第二行 `hooks module telltale loaded`、畫面另一面板不閃 |
| I8 | `hasSurvey` 為 true 時回 `next(e)` | 單元測試 |
| I9 | 不 hook `tool.call`／`classic.*`、不宣告 `process.*`／`fs.*`／`http.*`；`hooks.json` 只列一個 module | I1 涵蓋 |
| I10 | 面板 `view` 拿到 `undefined` 也畫（不空白） | 單元測試 |
| I11 | 每個寬度 ≥ MIN_COLUMNS 且 maxRows ≥ 4 時，畫面上至少有一行面板內容（擋「全砍掉就不會超寬」） | 切片 8 的腳本每步斷言 |

## 切片層（一次只細化下一批 task）

### 本輪功能（順序 = 題目 §9，票由 /拆任務 拆）

| 編號 | 行為（給 X 要得到 Y） | 驗收（硬性、二元） | 評測法 |
|---|---|---|---|
| 1 | 骨架：`.claude-plugin/plugin.json`、`hooks/hooks.json`、`register.tsx` 畫一行 `telltale · maxRows=<e.props.maxRows> · viewport=<e.viewport?.columns ?? "none">`（證明 props 真的讀到，且回答「viewport 有沒有」） | `claude plugin validate --strict .` exit 0；tmux 150×34 抓到那行且數字合理；debug log 無 `does not validate|hook failed|refused`；回報 viewport 實際值 | 手動＋腳本 |
| 2 | `width.ts` | 單元測試：ASCII、中文、混合、恰好等寬不動、超長裁切、空字串、控制字元；突變 3 條全紅 | exact |
| 3 | `layout.ts` | §1.2 七條規則各至少一個邊界案例（budget<1、maxRows=1／0、第一個 dropped 第二個塞得下、補 wantRows 補不完）；突變：min 上限、dropped、minRows 半個 | exact |
| 4 | harness + `register.tsx` 的 `ui.render`：hasSurvey 讓位、Client props 形狀、每行寬度、`calls` 七個都 ≥ 1 | `bun test` 連跑兩次 0 fail；I1／I4／I8 測試 | exact |
| 5 | hello 面板 + `$.store` 資料 + `error.<id>` + `$.clock.every` | I5（假面板 70 KiB）／I6／I10；tmux 看到 tick 在變 | exact＋手動 |
| 6 | `band.tsx` Client 畫 + 點標題列切換 | tmux 開兩個面板：SGR 點第二個面板標題 → **第二個**消失、第一個的內容不變、log 無第二次 `loaded`（I7、DoD #3）；點最右 4 欄不觸發；`hit.ts` 單元測試 | 手動＋exact |
| 7 | `/telltale` command | §1.6 表每列一測（含 unchanged、help、壞語法） | exact |
| 8 | 寬度 200→30 逐步縮 | 腳本：`for w in 200 150 110 80 60 45 30`：tmux resize、capture、量每行寬度 ≤ w，且每步至少一行面板內容（I11）；另跑 `w=15` 確認只剩一列且不炸 | 腳本 |
| 9 | README（貼 validate 輸出、高度 4 列、死區、emoji 不保證、store 位置與清除）、LICENSE（MIT）、CI | CI：`bun test` + `validate --strict` + **README 裡的 validate 區塊與當前輸出 diff 為空** | CI |

### 評測法
本專案沒有 LLM 成分，只有 exact match（單元／流程）與手動 tmux 實測；沒有評測層。

## 工具與環境約束（實作者與審查者每張票都會收到這一節）

- 程式碼與註解英文；docs／票中文。
- `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude --plugin-dir "$PWD" --debug-file <f>` 開發；存檔熱重載。
- 型別來源：`.claude/types/claude-code.d.ts`（`/plugin-types` 產，不手改；進版控方便 CI 型別檢查）。
- `tsconfig.json` 照型別檔檔頭；含 JSX 的檔一律 `.tsx`。
- 測試：`bun test hooks/`；閘：`make check`（Python 的 scripts 層 + validate + bun test）；突變：`make mutate`（`scripts/突變.py` 對 §5 表的每一條改壞一行跑 `bun test`，全綠即失敗）。
- 不准：`$.process.*`、`$.fs.*`、`$.http.*`、hook `tool.call`／`classic.*`（I9）。
- 手動實測用 tmux（題目 §5.3），每次都 grep debug log。

## 挑毛病紀錄

- 第 1 輪（2026-09-17）：三個對抗 agent 共 34 條；定義類 30 條已補進上文（§1.1 view 不回 null、§1.2 規則 1/2/4/7、§1.3 下界、§1.5 columnsHint／TITLE_RESERVE／死區／合併列、§1.6 unchanged／help、§2.1 `error.<id>`、§2.5 卸載、§4 I7 只認 tmux、I11、切片 1/3/5/6/8/9 的驗收加嚴）。偏好類 4 條問使用者：Q1 v0.1 面板數 → hello + clock；Q2 開關多 session 語意 → 全域共用；Q3 hello 的 tone 示範 → 奇偶 up/flat + dim；Q4 全部關掉 → 縮成一列。「AI 補的哪些第一版不要」→ 全部做。
- 第 2 輪起依 `~/.claude/rules/額度.md`（對抗式只跑 1 輪）由主 agent 直接補定義，不再派 agent。**挑毛病：1 輪，未解 0。**
