# SDD：telltale

> 定義是你對這個系統唯一的控制權。程式碼可以不看，這份不能不看。
> 題目原文（使用者交付的規格）在 `docs/題目.md`；本檔是把它對照 2.1.267 的型別檔之後定下來的版本，**衝突處以本檔為準**，衝突清單在 §0。

## 0. 與題目衝突的事實（對照 `.claude/types/claude-code.d.ts`，Claude Code 2.1.267）

| 題目說 | 型別檔／實測說 | 本檔的決定 |
|---|---|---|
| `claude plugin test <dir>` 全過 | 子指令不存在（帶旗標也沒有；npm latest 2.1.274 的 changelog 也沒提） | DoD #2 改成 `bun test hooks/` 連跑兩次 0 fail，harness 自建（§4） |
| 一律用 `e.props.bodyColumns` | `AbovePrompt` 的 props 只有 `hasSurvey`、`isWorking`、`maxRows`、`scroll`；`bodyColumns` 是 `Pane` 的 | 寬度由 `Client` 的 `surface.columns` 決定（那是 region 實際排版後的欄數，resize 會再呼叫一次）；hooks module 不算寬度 |
| `Client module="./chart.tsx"` 字面值路徑 | `hooks.json` 多一個 `"surface": "band.tsx"`（相對 hooks.json 的單一路徑），`Client` 的 `module` 是那個檔的**export 名** | `hooks.json = { modules: ["register.tsx"], surface: "band.tsx" }`，`<Client key="band" module="Band" props={…} />` |
| `ClientElements` 少 `Raster` | `Omit<Elements['terminal'], 'Client'>`；整份型別檔沒有 `Raster` | 不提 Raster |
| `userConfig` 欄位 `kind`／`label`；每欄自動變 `/config` 一列 | 官方文件：欄位是 `type`／`title`／`description`；`/config` 列要 **v2.1.269+**，本機 2.1.267 沒有 | 面板開關的真值放 `$.store`（鍵 `panels`），由 `/telltale` 改；`userConfig` 只留 `panel.<id>` 的 `default` 當第一次的種子。詳 §2.4 |
| `$.store` 上限「全部加起來」（句子截斷） | 4 MiB JSON 文字 | 不變量 I5 |
| 型別檔約 10,900 行 | 8,752 行 | 無影響 |

沒衝突、但題目沒寫而型別檔有寫的：
- `ui.render` **每個輸入值只跑一次**（props、viewport 寬度、plugin 載入、`$.ui.invalidate("ui.render")`）；repaint 重用答案。所以資料更新後要自己 `invalidate`，每秒最多十次。
- `ClientSurface.every` 要在 `state` 還是 `undefined` 時啟動一次，不能每次繪製都啟動。
- `Client` 超時或 throw 會**卸載該實例**並畫一行錯誤，不是整條帶消失。
- `command.register` 的 `name` 只准 `[A-Za-z0-9_-]{1,64}`。

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
  now: () => number;
  // v0.1 沒有面板需要它，先不宣告 fetch。加進來的那天 validate 的 calls: 會多 $.http.fetch，要同時改 README。
};

export type Panel<D = unknown> = {
  id: string;            // ^[a-z][a-z0-9-]{0,15}$；$.store 鍵、/telltale 參數、userConfig 鍵的尾段
  label: string;         // /telltale status 顯示用
  defaultOn: boolean;
  minRows: number;       // ≥ 1
  wantRows: number;      // ≥ minRows
  everyMs?: number;      // 有 poll 才有；≥ 1000
  poll?: (io: PanelIo) => Promise<D>;   // 回傳值會 JSON round-trip 後進 $.store
  view: (data: D | undefined, columns: number, rows: number) => PanelView | null;  // 純函式
};
```

`view` 的契約（測試直接打）：
- 同樣的 `(data, columns, rows)` 給同樣的輸出（沒有 `Date.now()`、沒有隨機）。
- `data === undefined`（還沒 poll 過、或 store 讀不到）**要畫**，畫成明顯的「尚無資料」，不回 `null`。
- 回 `null` 只代表「這個 rows 畫不下」，框架會當成 dropped。
- 輸出的每一行 `displayWidth(text) ≤ columns`、`lines.length ≤ rows`；超出是面板的 bug，框架**不補救**，測試會抓。

#### 1.2 版面調度（`hooks/layout.ts`）：框架核心，純函式

```ts
export const BAND_ROWS_MAX = 9;          // 唯一來源；標題 1 + 內容 + 狀態 1
export const FIXED_ROWS = 2;             // 標題列 + 狀態列
export const CONTENT_ROWS_MAX = BAND_ROWS_MAX - FIXED_ROWS;   // 不另寫數字

export type Want = { id: string; minRows: number; wantRows: number };
export type Slot = { id: string; rows: number };
export type Layout = { slots: Slot[]; dropped: string[]; total: number };

export const layout = (panels: readonly Want[], maxRows: number): Layout;
```

規則（每條都有測試與突變）：
1. `budget = min(maxRows, BAND_ROWS_MAX) - FIXED_ROWS`；`budget < 1` 時 `slots = []`，全部 dropped，`total = min(maxRows, FIXED_ROWS)`（至少畫標題，標題列裡塞狀態）。
2. 依 `panels` 順序，每個面板先拿 `minRows`；拿不到的整個進 `dropped`，**不畫半個**，繼續看下一個（後面較小的面板仍可能塞進去）。
3. 第一輪分完剩下的列，再依順序補到各面板的 `wantRows` 為止。
4. `total = FIXED_ROWS + Σ slots.rows ≤ min(maxRows, BAND_ROWS_MAX)`。
5. 輸出確定：同輸入同輸出；`slots` 順序 = 輸入順序；`dropped` 順序 = 輸入順序。

#### 1.3 顯示寬度（`hooks/width.ts`）：純函式

```ts
export const displayWidth = (s: string): number;          // 東亞寬字（W／F）算 2，其餘 1；控制字元算 0
export const fit = (s: string, columns: number): string;   // 裁到 ≤ columns；裁掉時尾端補 "…"（算 1 欄）
```

寬字表：CJK 統一漢字、假名、諺文、全形 ASCII、CJK 標點與符號（U+1100–115F、U+2E80–A4CF、U+AC00–D7A3、U+F900–FAFF、U+FE30–FE4F、U+FF00–FF60、U+FFE0–FFE6、U+20000–2FFFD、U+30000–3FFFD）。emoji 不保證（v0.1 不做）。

#### 1.4 hooks module（`hooks/register.tsx`）：唯一碰 `$` 的地方

```ts
export const register: Register = (on, options) => {
  on("session.start", …)                                  // 讀 $.store 種子、註冊 /telltale、啟動各面板的 $.clock.every
  on("ui.render", { component: "AbovePrompt" }, …)        // 見 §3 Pipeline
  on("ui.message", …)                                     // Client post 進來的點擊：{ kind: "toggle", id }
  on("command.run", { command: "telltale" }, …)
};
```

允許的 `$` 呼叫（validate 的 `calls:` 一行要**恰好**是這些）：`$.ui.resolve`、`$.ui.invalidate`、`$.clock.now`、`$.clock.every`、`$.store.get`、`$.store.set`、`$.command.register`。`$.env.get` 本輪沒有用到就不宣告（題目允許但 YAGNI）。

#### 1.5 surface module（`hooks/band.tsx`）：畫＋滑鼠，跑在繪製執行緒

```ts
export type BandProps = {                      // hooks module 傳給 Client 的 props（JsonValue）
  columnsHint: number;                         // e.viewport.columns，只當 Client 還沒排版（surface.columns === 0）時的備援
  panels: { id: string; label: string; rows: number; lines: PanelLine[] }[];   // 已經 layout 過的
  dropped: string[];
  status: string;                              // 狀態列文字（不含 dropped 那段，由 band 組）
  at: number;                                  // 資料時間戳，狀態列顯示「Xs ago」
};
export function Band(props: BandProps, surface: ClientSurface<BandState>): RenderElement;
```

- 每次呼叫都重掛 `surface.onPointer`（回呼裡只讀 `surface.state`，不讀閉包）。
- 點擊（`down` 後同格 `up`）落在某面板標題列 → `surface.post({ kind: "toggle", id })`。這是本輪唯一的滑鼠功能；hover 不做。
- 寬度：`columns = surface.columns || props.columnsHint`；每一行用 `fit(text, columns)` 再畫，第一列另外扣 4（引擎的 `[-]` 蓋最右 3 欄）。
- **這個檔的輸出沒有自動測試守著**（Client 在繪製執行緒）；命中判定 `hitPanel(y, panels)` 抽到 `hooks/hit.ts` 純函式去測。

#### 1.6 `/telltale` command

| 輸入 | 輸出 `text` |
|---|---|
| `/telltale`、`/telltale status` | 每面板一行：`● hello  on   3 rows` / `○ git  off` / `⋯ trace  on  dropped (height)`；末行 `band: N rows of M available` |
| `/telltale <id>` | 切換該面板，回 `hello: on → off` |
| `/telltale <id> on`／`off` | 設定，回同上格式 |
| `/telltale on`／`off` | 全部面板 |
| 未知 id | `unknown panel "x"; known: hello` （不猜、不模糊比對） |

### 2. 資料模型

#### 2.1 `$.store` 鍵（plugin 內唯一持久狀態）

| 鍵 | 值 | 誰寫 |
|---|---|---|
| `panels` | `{ [id]: boolean }` 面板開關 | `session.start`（缺的 id 用 `defaultOn` 補）、`command.run`、`ui.message` |
| `data.<id>` | `{ at: number; data: unknown }` 面板最近一次 poll 的結果 | 該面板的 `$.clock.every` 回呼 |

寫 `data.<id>` 沒有原子性；多 session 同時 poll 只會重複寫同一種值，無害（I6）。

#### 2.2 面板註冊表（`hooks/panels/index.ts`）

`export const PANELS: readonly Panel[]`，順序就是畫的順序。v0.1 只有 `hello`。id 不可重複（測試守）。

#### 2.3 hello 面板（`hooks/panels/hello.ts`）

- `id: "hello"`, `minRows: 1`, `wantRows: 2`, `everyMs: 5000`
- `poll`: 回 `{ tick: io.now() }`（poll 拿不到上一次的值，所以不做計數器）。
- `view`: 第 1 行 `hello · <HH:MM:SS of tick>`，第 2 行（有第 2 列時）`寬 W 欄 · 高 R 列`（故意放中文，讓寬度計算有真實案例）。`data` 為 undefined 時第 1 行是 `hello · waiting for first tick`。

#### 2.4 面板開關為什麼不用 `userConfig`

2.1.267 的 `userConfig` 只在 enable 時提示一次、`/config` 列要 2.1.269+；而且改 `userConfig` 會**重載整個 module**（題目 §3.5 實測）。開關放 `$.store` 就沒有重載：關掉一個面板只是下一次 render 少畫一塊，DoD #3 直接成立。`plugin.json` 仍宣告 `panel.hello`（`type: "boolean"`, `default: true`）：`session.start` 時 `panels` 鍵缺該 id 才拿 `options["panel.hello"]` 當種子，之後以 store 為準。

### 3. Pipeline（產品的執行流程）

```
session.start
  ├─ panels ← $.store.get("panels") ⊕ 缺的用 options/defaultOn 補 → $.store.set
  ├─ $.command.register({ name: "telltale", … })
  └─ 每個有 poll 的面板：$.clock.every(everyMs, async () => {
         data ← await panel.poll({ now: $.clock.now })
         $.store.set(`data.${id}`, { at: $.clock.now(), data })
         $.ui.invalidate("ui.render")
     })   ← 先跑一次，不等第一個 everyMs

ui.render{AbovePrompt}
  ├─ e.props.hasSurvey → return next(e)                    （讓位）
  ├─ wants ← PANELS.filter(panels[id]) 的 {id,minRows,wantRows}
  ├─ { slots, dropped } ← layout(wants, e.props.maxRows)
  ├─ 每個 slot：cached ← await $.store.get(`data.${id}`)；view ← panel.view(cached?.data, e.viewport.columns, slot.rows)
  │     view === null → 併入 dropped
  └─ return <Client key="band" module="Band" props={BandProps} />

Band(props, surface)                                        （繪製執行緒）
  ├─ columns ← surface.columns || props.columnsHint
  ├─ 第 1 列：標題 "telltale" + 狀態摘要，fit 到 columns-4
  ├─ 每面板：標題列 "─ label ─…" + lines（各 fit 到 columns）
  ├─ 末列：dropped 非空 → "⋯ git, trace not shown (height)"；否則 "updated 3s ago"
  └─ onPointer：down/up 同格且落在面板標題列 → post({ kind:"toggle", id })

ui.message{ kind:"toggle" } / command.run{telltale}
  └─ panels[id] 翻轉 → $.store.set("panels") → $.ui.invalidate("ui.render")；command 回 { text }
```

停止條件：`$.clock.every` 隨 module 卸載停；沒有其他迴圈。

### 4. 測試 harness（取代不存在的 `claude plugin test`）

`hooks/harness.ts`：

```ts
export const fakeEngine = (opts?: { store?: Record<string, unknown>; now?: number; options?: PluginOptions }) => ({
  $,                 // ui.resolve 回 h-tag 建構子表；ui.invalidate 計數；clock.now 回 opts.now；store 讀寫 opts.store（走 JSON round-trip）；command.register 記名
  on,                // 收 register 註冊的 handler，依 (event, matcher) 存
  fire(event, e),    // 呼叫對應 handler，next(e) 回 { text:"" } 或 null 樹
  invalidations: number,
});
```

跑法：`bun test hooks/`（bun 讀 `.tsx`、`jsxFactory: h` 由 `tsconfig.json` 給）。`clientOf(tree)` 走樹找 `type === "Client"` 的節點，斷言它的 `props`。

**Client 內部畫的東西測不到**：`band.tsx` 只靠 `hit.ts`、`width.ts` 的純函式測試 + §5.3 tmux 實測。

### 5. 不變量（不管怎麼實作都不能違反）

| # | 不變量 | 守它的機制 |
|---|---|---|
| I1 | `validate --strict` exit 0，`calls:` 恰好 = §1.4 那七個 | `make check` 跑 validate 並 diff 那一行 |
| I2 | `layout()` 的 `total ≤ min(maxRows, BAND_ROWS_MAX)`，且每個 slot `rows ≥ minRows` | 單元測試 + 突變 `Math.min(maxRows, BAND_ROWS_MAX)` → `maxRows` |
| I3 | 被砍的面板出現在 `dropped`，且狀態列印出來 | 單元測試 + 突變 `dropped` 清空 |
| I4 | 傳給 `Client` 的每一行 `displayWidth ≤ columns`；中文算 2 | 單元測試（columns 30 塞中文）+ 突變 `wide ? 2 : 1` → `1` |
| I5 | `$.store` 總量 < 4 MiB：每個 `data.<id>` 寫入前 `JSON.stringify` 長度 > 64 KiB 就丟掉不寫、狀態列印 `hello: data too large` | 單元測試 |
| I6 | 重複 poll 無害：同一 `data.<id>` 寫兩次結果一樣 | hello 的 poll 是純的；規約寫在 Panel 契約 |
| I7 | 開關切換不重載：切換前後 `fakeEngine` 的 `register` 只被呼叫一次、`data.*` 不變 | 流程測試 |
| I8 | `hasSurvey` 為 true 時回 `next(e)` | 單元測試 |
| I9 | 不 hook `tool.call`／`classic.*`、不宣告 `process.*`／`fs.*`／`http.*` | I1 涵蓋 |
| I10 | 面板 `view` 拿到 `undefined` 也畫（不空白） | 單元測試 |

## 切片層（一次只細化下一批 task）

### 本輪功能（順序 = 題目 §9，票由 /拆任務 拆）

| 編號 | 行為（給 X 要得到 Y） | 驗收（硬性、二元） | 品質 | 評測法 |
|---|---|---|---|---|
| 1 | 骨架：`.claude-plugin/plugin.json`、`hooks/hooks.json`、`register.tsx` 畫一行固定字 | `claude plugin validate --strict .` exit 0；tmux 150×34 抓到那行字；debug log 無 `does not validate|hook failed|refused` | — | 手動＋腳本 |
| 2 | `width.ts`：`displayWidth`／`fit` | 單元測試：ASCII、中文、混合、超長裁切、空字串；突變 3 條全紅 | — | exact |
| 3 | `layout.ts` | §1.2 五條規則各一測；突變：min 上限、dropped、minRows 半個 | — | exact |
| 4 | harness + `register.tsx` 的 `ui.render`：hasSurvey 讓位、Client props 形狀、每行寬度 | `bun test` 連跑兩次 0 fail；I4／I8 測試 | — | exact |
| 5 | hello 面板 + `$.store` 資料 + `$.clock.every` | I5／I6／I10；tmux 看到 tick 在變 | — | exact＋手動 |
| 6 | `band.tsx` Client 畫 + 點標題列切換 | tmux：送 SGR 點擊後面板消失、`data.hello` 不變（I7）；`hit.ts` 單元測試 | — | 手動＋exact |
| 7 | `/telltale` command | §1.6 表每列一測 | — | exact |
| 8 | 寬度 200→30 逐步縮：每行 `displayWidth ≤ columns` | 腳本：`for w in 200 150 110 80 60 45 30`：tmux resize、capture、量每行寬度 | — | 腳本 |
| 9 | README（貼 validate 輸出）、LICENSE（MIT）、GitHub Actions 跑 `bun test` + validate | CI 綠 | — | CI |

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
