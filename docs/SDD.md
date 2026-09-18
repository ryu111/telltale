# SDD：telltale

> 定義是你對這個系統唯一的控制權。程式碼可以不看，這份不能不看。
> 題目原文（使用者交付的規格）在 `docs/題目.md`；本檔是把它對照 2.1.267 的型別檔之後定下來的版本，**衝突處以本檔為準**，衝突清單在 §0。

## 0. 與題目衝突的事實（對照 `.claude/types/claude-code.d.ts`，Claude Code 2.1.267）

| 題目說 | 型別檔／實測說 | 本檔的決定 |
|---|---|---|
| `claude plugin test <dir>` 全過 | 子指令不存在（帶旗標也沒有；npm latest 2.1.274 的 changelog 也沒提） | DoD #2 改成 `bun test tests/hooks/` 連跑兩次 0 fail，harness 自建（§4） |
| 一律用 `e.props.bodyColumns` | `AbovePrompt` 的 props 只有 `hasSurvey`、`isWorking`、`maxRows`、`scroll`；`bodyColumns` 是 `Pane` 的 | 寬度由 `Client` 的 `surface.columns` 決定（region 實際排版後的欄數，resize 會再呼叫一次）；hooks module 只算高度、不算寬度（§1.5） |
| `Client module="./chart.tsx"` 字面值路徑 | `hooks.json` 多一個 `"surface": "band.tsx"`（相對 hooks.json 的單一路徑），`Client` 的 `module` 是那個檔的**export 名** | `hooks.json = { modules: ["register.tsx"], surface: "band.tsx" }`，`<Client key="band" module="Band" props={…} />`（`key` 是樹上的位址、`module` 是 export 名，兩個字串刻意不同） |
| `ClientElements` 少 `Raster` | `Omit<Elements['terminal'], 'Client'>`；整份型別檔沒有 `Raster` | 不提 Raster |
| `userConfig` 欄位 `kind`／`label`；每欄自動變 `/config` 一列 | 官方文件：欄位是 `type`／`title`／`description`；`/config` 列要 **v2.1.269+**，本機 2.1.267 沒有 | 面板開關的真值放 `$.store`，由 `/telltale` 改；`userConfig` 只留 `default` 當第一次的種子。詳 §2.4 |
| `$.store` 上限「全部加起來」（句子截斷） | 4 MiB JSON 文字；實體在 `~/.claude/plugins/store/`，跨 session、跨熱重載保留 | 不變量 I5；卸載見 §2.5 |
| 型別檔約 10,900 行 | 8,752 行 | 無影響 |
| `e.viewport.columns` 是 transcript 寬（200 欄回 110） | 〔實測 票 01〕150 欄的 tmux 回 `viewport=150`，就是終端寬；`maxRows` 在 34 列終端回 9 | `columnsHint` 直接用 `e.viewport?.columns ?? 80`；Band 仍以 `surface.columns` 為準 |
| `userConfig` 鍵 `panel.hello` | 〔實測 票 01〕鍵含 `.` 被 validate 判 `Invalid input`（文件：keys must be valid identifiers） | 鍵改 `panel_hello`／`panel_clock` |
| — | 〔實測 票 01〕plugin 根目錄放 `CLAUDE.md` 在 `--strict` 是 warning→exit 1（「not loaded as project context」） | 專案的 CLAUDE.md 搬到 `.claude/CLAUDE.md` |

沒衝突、但題目沒寫而型別檔有寫的：
- `ui.render` **每個輸入值只跑一次**（props、viewport 寬度、plugin 載入、`$.ui.invalidate("ui.render")`）；repaint 重用答案。資料更新後要自己 `invalidate`，每秒最多十次。
- `e.viewport` 是 **optional**（「Absent where no surface has measured」）。任何讀它的地方都要 `e.viewport?.columns ?? 80`。
- `ClientSurface.every` 要在 `state` 還是 `undefined` 時啟動一次，不能每次繪製都啟動。
- `Client` 超時或 throw 會**卸載該實例**並畫一行錯誤，不是整條帶消失。
- `command.register` 的 `name` 只准 `[A-Za-z0-9_-]{1,64}`。
- `$.store` 是 plugin 層級、跨 session 共用（同一個人所有 session 看到同一份）。

### 0.1 第二輪追加（2026-09-17，spike 實測：`scratchpad/spike/probe.tsx`，一次真的派 Explore subagent＋背景 Bash）

| 題目說 | 型別檔／實測說 | 本檔的決定 |
|---|---|---|
| §7.1 資料層走 PostToolUse shell hook 寫 JSONL | 2.1.267 有 `$.agent.list()`：`{ id, description, type, status, parentId?, name?, spawnedBy? }`，2 s 輪詢就看到 running→completed | 不寫 JSONL、不開 `$.fs.read`；`calls:` 多 `$.agent.list` |
| §7.1 顯示 id／type／status／**model** | `AgentInfo` 沒有 model；model 只在派工那步 `turn.step` 的 `Agent` 工具 input 裡 | 用 description 對回去（§2.6），對不到就顯示空 |
| — | **背景 Bash／Monitor／Workflow 不在 `agent.list`**；只出現在派它的 `turn.step.toolUses[].input`（`run_in_background: true`）與結束時 `session.receive{origin=task-notification}` 的 text（含 `Background command "<description>" completed`） | 背景任務用 description 配對（§2.6）；使用者裁定守 §6 規矩，不 hook `classic.PostToolUse` 換精確 id |
| — | `ui.render{component=Spinner}` 給 `mode`（responding／tool-input／tool-use／thinking／requesting），沒有經過時間 | 經過時間從 `turn.start` 的時刻自己算 |
| — | `session.start` hook 沒 `return next(e)` 整個被跳過（`hook failed: returned no result`），timer 也不會活 | 每個 hook 一律 `return next(e)`（I13） |
| — | **2.1.274 實測（2026-09-17 升版後）**：`hooks.json` 無 `surface`、Client 用 `module="./band.tsx"`；`$.clock.now()` 回 Promise；`claude plugin test` 存在（kit：`claude-code/testing` 的 describe／test／expect／Engine `$`）；Pane 自適應（150 欄靠右 dock、100 欄變輸入框上方方框，`bodyColumns` 66→96） | 已遷移；v0.2 呈現層改成「寬→Pane、窄→引擎自動落下」（使用者裁定 2026-09-17）；票 19：評估把 harness 搬到 `claude plugin test`（DoD #2 原意） |
| — | **`turn.step` 是串流事件**（票 12 實測）：hook 必須是 `async function* ($, e, next) { const result = yield* next(e); …; return result; }`，寫成 async function 會被 validate 拒（"not an async generator"）；`toolUses` 在 result 上 | 已照做；harness 的 fire 對 turn.step 走串流驅動 |
| — | 平常載入：`~/.claude/skills/telltale` symlink 到 checkout 可行，`settings.json` 的 `env` 開旗標可行 | README／CLAUDE.md 已寫 |

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

#### 1.1a v0.2 擴充：cell 面板與框架注入的資料源（挑毛病後改寫：只有一套呈現模型）

第一輪的 `PanelLine` 只夠畫靜態文字列。agents 面板要畫會動的 cell，所以面板契約多一種輸出：`view()` 可以回 `{ kind: "cells", cells: Cell[] }`（取代 `lines`），由 Client 端的純函式 `renderCell`（`hooks/cells.ts`，跑在繪製執行緒，每幀呼叫）排成字元列。**沒有 `PanelLine.live`、沒有 `composeLive`**——那是訪談中途的設計，已淘汰；hello／clock 仍回 `lines`。

```ts
export type Step = { name: string; detail?: string; t0: number; t1?: number };   // t0＝事件抵達（node 出生）時刻；t1＝結束
export type Cell = {
  id: string; kind: "main" | "sub" | "bg"; label: string; model?: string; desc: string;
  status: "running" | "completed" | "failed" | "killed" | "orphan";
  firstAt: number; endAt?: number; updatedAt: number;                             // updatedAt＝最後一次事件（flash 用）
  steps: Step[];                                                                    // 最多 STEPS_MAX = 64，超過在**儲存層**把最舊的合併成一個 { name: "… ×N" }（點開 cell 看到的就是合併後的）
  dismissed?: true;
};
export type PanelIo = { now: () => Promise<number>; agents?: () => Promise<AgentInfo[]> };   // 只有 needsAgents 的面板拿得到 agents
export type Panel<D> = { ...第一輪欄位...; needsAgents?: boolean; stages?: Stages };
```

- 呼吸、打字機、光點、鏡頭、收合、消失全部是 `renderCell(cell, style, w, h, now, frame, cam)` 從 `Cell` 的時間戳＋`now`／`frame` 算出來的，Cell 不存視覺狀態。時間常數是 `hooks/cells.ts` 的具名 export：`TRANSIT_MS = 600`、`BIRTH_MS = 400`、`BREATHE_MS = 600`、`SLIDE_MS = 500`、`COLLAPSE_AFTER_MS = 3000`、`VANISH_AFTER_MS = 60_000`、`FLASH_MS = 1000`、`CAMERA_MARGIN = 28`、`CAMERA_GAIN = 0.25`、`MARQUEE_STEP_MS = 300`、`STEPS_MAX = 64`、`LONG_RUN_MS = 30 min`、`ORPHAN_MS = 2 h`。
- `hit`：Client 用 `rowsOf` 同一套列數推算命中，post `{ kind: "row", id: <panel>, hit: <cellId> }` 給 `ui.message`；面板在 `onRow?(hit, state) => state` 純函式裡決定意思。

#### 1.2 版面調度（`hooks/layout.ts`）：框架核心，純函式，只管高度

```ts
export const BAND_ROWS_MAX = 9;          // 唯一來源；標題 1 + 內容 + 狀態 1
export const TITLE_ROWS = 1;             // 標題列，永遠在（票 23）
export const STATUS_ROWS = 1;            // 狀態列，有事才在（票 23，使用者 2026-09-18 裁定）
export const FIXED_ROWS = TITLE_ROWS + STATUS_ROWS;   // 狀態列出現時的固定列數
export const CONTENT_ROWS_MAX = BAND_ROWS_MAX - TITLE_ROWS;   // 不另寫數字；沒有狀態列時內容最多幾列
export const MIN_COLUMNS = 20;           // 窄於這個，整條帶只畫一列（§1.5）

export type Want = { id: string; minRows: number; wantRows: number };
export type Slot = { id: string; rows: number };
export type Layout = { slots: Slot[]; dropped: string[]; total: number; status: boolean };

export const layout = (panels: readonly Want[], maxRows: number, opts?: { status?: boolean }): Layout;
```

規則（每條都有測試與突變）：
0. （票 23）固定列數 `fixed`：`opts.status`（框架在有面板 `error` 時傳 true）→ `FIXED_ROWS`；否則先用 `TITLE_ROWS` 算一次，**有任何面板進 `dropped` 就改用 `FIXED_ROWS` 重算一次**（狀態列要印被砍的面板）。回傳的 `status` = 這次有沒有狀態列。
1. `budget = min(maxRows, cap) - fixed`（`cap` 預設 `BAND_ROWS_MAX`；票 32 起 Pane 站傳 `bodyRows`），**算一次、是常數**，不隨分配遞減後重判。
2. `budget < 1`（含 `maxRows ≤ FIXED_ROWS`、`maxRows ≤ 0`）：`slots = []`、全部進 `dropped`、`total = max(1, min(maxRows, FIXED_ROWS))`。`total === 1` 時 band 把標題與狀態合併成一列（§1.5）。
3. 依 `panels` 順序，每個面板先拿 `PANEL_TITLE_ROWS (=1) + minRows`（從 `budget` 扣；那一列是 §1.5 的 `─ label ─` 標題列，**票 06 實測漏算過，狀態列蓋掉了 clock 的標題**）；扣不起的整個進 `dropped`，**不畫半個**，繼續看下一個（後面較小的面板仍可能塞進去）。
4. 第一輪分完剩下的列，再依順序補到各面板的 `wantRows` 為止；補不完就留白（`total` 可以小於上限，用 `≤` 不用 `=`）。
5. `total = (status ? FIXED_ROWS : TITLE_ROWS) + Σ (PANEL_TITLE_ROWS + slots.rows) ≤ min(maxRows, cap)`（規則 2 的情況除外，那時 `total ≤ FIXED_ROWS`）。`slot.rows` 是內容列數，不含標題列。
6. 輸出確定：同輸入同輸出；`slots` 順序 = 輸入順序；`dropped` 順序 = 輸入順序。
7. `layout` **不吃 columns**：寬度改變永遠不改變高度。帶子高度只在「maxRows 變」或「開關變」時變（回答使用者「resize 時高度跳動」的顧慮）。

預設狀態的高度（v0.1，hello 與 clock 都開）：`FIXED_ROWS + (1 + hello.wantRows) + (1 + clock.wantRows) = 2 + 3 + 2 = 7` 列，寫進 README。

規則 8（v0.2，段位）：面板可宣告 `stages: { summary: 0, compact: 3, full: "rest" }`，目前段位存 `$.store` 的 `size.<id>`（預設 `compact`）。`layout()` 收到的 `minRows／wantRows` 由框架依段位算：`summary → (0, 0)`（只畫標題列，摘要文字由面板 `title(data)` 提供）、`compact → (2, 3)`、`full → (3, CONTENT_ROWS_MAX)`，`"rest"` 的意思是「剩多少要多少」，仍受規則 2／5 約束。沒有 `stages` 的面板照第一輪（minRows／wantRows 固定）。

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
- 末列（狀態列）：**只在 `props.status` 為 true 時存在**（票 23）：`dropped` 非空 → `⋯ git, trace not shown (height)`；有面板 `error` → `hello: data too large`。沒事就沒有這一列（那一列還給面板內容；原本的 `updated Ns ago` 在 agents 每秒 poll 下永遠是 0s，拿掉）。
- `tone` → 顏色：`up` 綠、`down` 紅、`flat` 預設色、`dim` dimColor。只表達嚴重度，不閃、不加粗（題目 §7.4）。
- **每次呼叫都重掛 `surface.onPointer`**（回呼裡只讀 `surface.state`、不讀閉包）。點擊 = `down` 後同一格 `up`；落在某面板標題列且 `x < columns - TITLE_RESERVE` → `surface.post({ kind: "toggle", id })`。最右 4 欄是死區（README 寫明）。hover 不做。
- **這個檔的輸出沒有自動測試守著**（Client 在繪製執行緒）；命中判定 `hitPanel(y, panels): string | null` 抽到 `hooks/hit.ts` 純函式去測（列數從 `props.total` 與各 `rows` 算，跟畫的用同一個函式 `rowsOf(props)`，不許兩份）。

v0.2 追加（Client）：

- **點面板標題列**：v0.2 起＝**循環段位**（summary → compact → full → summary），post `{ kind: "stage", id }`；不再是開關。開關只剩 `/telltale <id> [on|off]`。沒有 `stages` 的面板（hello／clock）點標題仍是開關（相容第一輪 DoD #3 的實測與測試）。
- **標題列最右的視圖字樣**（`lanes`／`tree`，寬 5，在 TITLE_RESERVE 死區左側）點了 post `{ kind: "view", id }`。
- **內容列**：`PanelLine.hit` 有值的列可點，post `{ kind: "row", id, hit }`。
- **動畫**：Client 用 `surface.every(80, …)` 走幀計數，重畫所有 `status === "running"` 或抵達中（`now - steps[last].t0 < TRANSIT_MS + BIRTH_MS`）的 cell；其餘 cell 每秒重畫一次（經過時間）。每幀繪製量要量：全滿（Pane 40 列 × 150 欄）的 `renderCell` 總和必須 < 5 ms（ClientModule 超時會被卸載，題目 §3.4）。
- 狀態切換高亮：`now - cell.updatedAt < FLASH_MS` 時邊框亮綠粗體，Client 只看時間，不記狀態。

#### 1.6 `/telltale` command

| 輸入 | 輸出 `text` |
|---|---|
| `/telltale`、`/telltale status` | 每面板一行：`● hello  on   2 rows` / `○ git  off` / `⋯ trace  on  dropped (height)`；末行 `band: N rows of M available` |
| `/telltale <id>` | 切換該面板，回 `hello: on → off` |
| `/telltale <id> on`／`off` | 設定；已經是該狀態回 `hello: on (unchanged)` |
| `/telltale on`／`off` | 全部面板，一面板一行同上格式 |
| `/telltale help`、或任何不合語法的輸入（第三個 token、`on`/`off` 以外的第二個 token） | `usage: /telltale [status|help|on|off|<panel> [on|off]]  panels: hello, clock`（面板清單由註冊表動態列出） |
| 未知 id | `unknown panel "x"; known: hello, clock`（不猜、不模糊比對） |

v0.2 追加：

| 輸入 | 輸出 |
|---|---|
| `/telltale agents style` ／ `style auto|v1|v2|v4` | `agents style: auto`／`agents style: auto → v1`；相同回 `(unchanged)`（v0.2b：沒存過就是 `auto`＝依 placement 決定，§2.8） |
| `/telltale agents edge` ／ `edge right|bottom|both` | 同上；引擎沒有的值回 `edge top: not available in this build`（v0.2b：三態語意見 §2.8） |
| `/telltale agents size` ／ `size summary|compact|full` | 同上格式，鍵 `size.agents` |
| `/telltale agents clear` | 點掉所有 failed／killed 與孤兒 lane：`agents: cleared 2` |
| `/telltale status` | 每個面板多印段位：`● agents  on   compact  3 rows` |

### 2. 資料模型

#### 2.1 `$.store` 鍵（plugin 內唯一持久狀態；表是完備的，實作不准多加鍵）

| 鍵 | 值 | 誰寫 | 誰清 |
|---|---|---|---|
| `panels` | `{ [id]: boolean }` 面板開關 | `session.start`（缺的 id 用種子補）、`command.run`、`ui.message` | 不清 |
| `data.<id>` | `{ at: number; data: unknown }` 面板最近一次成功 poll 的結果 | 該面板的 `$.clock.every` 回呼 | 不清（下次成功覆蓋） |
| `error.<id>` | `string`，最近一次 poll 的錯誤（`"data too large"`、或 exception 的 message） | 同上 | 下一次成功 poll 時寫 `""`（不用 `$.store.delete`，免得 `calls:` 多一個 op） |

`panels` 是**同一個人所有 session 共用**（§0 最後一條）：在 session A 關掉，session B 下一次 render 也會少那塊。這是 /config 一樣的語意，README 寫明；不做 per-session（挑毛病 Q2 已定）。

寫 `data.<id>` 沒有原子性；多 session 同時 poll 只會重複寫同一種值，無害（I6）。

v0.2 追加的鍵（仍是完備表；每鍵 < 64 KiB，I5 同樣適用）：

| 鍵 | 值 | 誰寫 |
|---|---|---|
| `size.<id>` | `"summary" \| "compact" \| "full"` | stage 訊息、`/telltale <id> size` |
| `agents.cells.<sid>`（v0.2b 前是 `agents.cells`） | `{ [cellId]: Cell }`（§2.6 的形狀；main 的 cellId = turnId、sub = agentId、bg = `${startAt}-${description}`）；completed 60 s 後刪、failed／孤兒留到 dismissed。**`<sid>` = `$.session.id()`，一個 session 只讀寫自己的**（§2.8） | poll 與各觀察型 hook |
| `style.agents` | `"auto" \| "v1" \| "v2" \| "v4"`（沒存過視同 `auto`） | `/telltale agents style`、標題列按鍵 |
| `edge.agents` | `"auto" \| "right" \| "bottom" \| "both"`（沒存＝auto；right 與 auto 只差有沒有明存，票 30；引擎沒有的 top／left 不收） | `/telltale agents edge`、標題列按鍵 |
| `agents.expanded.<sid>` | `{ id, at } \| null`（完成的 cell 被點開，10 s 後 Client 視為 null） | row 訊息 |
| `error.agents.<sid>` | 同 `error.<id>`，但 agents 的按 session 分（§2.8） | agents 的 tick |
| `agents.hinted` | `true`（首次啟用提示已顯示） | 第一次 render |

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

#### 2.6 agents 面板（`hooks/panels/agents.ts`；長相以 `docs/DESIGN.md` 為準）

- `id: "agents"`, `label: "agents"`, `defaultOn: true`, `needsAgents: true`, `stages: { summary: 0, compact: 3, full: "rest" }`, `everyMs: 1000`。
- **poll**（每秒）：`io.agents()` → 對照 `agents.cells` 裡 `kind === "sub"` 的 cell：新 id 開 cell（`firstAt = now`，steps `[prompt]`，desc＝description）；status 從 running 變成其他 → `endAt = now`、`updatedAt = now`、push `reply` 或標 failed／killed；`completed` 且 `now - endAt > VANISH_AFTER_MS` 的刪；failed／killed 留到 `dismissed`。**`agents.cells` 是唯一的 store 鍵**（`seen`／`tasks`／`turn` 不存在，是舊稿）。
- **model 對回去**：`turn.step` 看到 `Agent` 工具 input（`description`、`model?`、`subagent_type`）就記到 `pendingSpawns`（記憶體，不進 store）；下一次 poll 出現的新 sub cell 若 `description` 相同，取最早一筆的 `model` 寫進 `cell.model` 並移除那筆，配不到就空。**已知限制**：同 description 同時派兩個時，model 可能配錯（實作註解要寫明，不是 bug）。
- **背景任務**：`turn.step` 的 toolUses 裡 `Bash{ run_in_background: true }` → 開 `kind: "bg"` 的 cell（label `bg`、desc 取 input.description，缺就 command 前 40 字）；工具名 `Monitor`／`Workflow`（2.1.274 型別檔工具表裡的真實名字，大小寫照抄）同理。`session.receive`（matcher `{ origin: { kind: "task-notification" } }`，2.1.274 的 origin 是物件）的 text 用 regex `Background command "([^"]+)" completed|Task "([^"]+)"|Workflow "([^"]+)"` 抓 description，關掉最早一條同名未結束的 bg cell。**已知限制**：同名並行的背景任務可能關錯條（使用者裁定守規矩不拿精確 id）；點 cell 可手動點掉。兩級判定（挑毛病後）：`now - firstAt > LONG_RUN_MS(30 min)` 只把經過時間變黃（久跑，仍 running）；`> ORPHAN_MS(2 h)` 且沒通知才 `status: "orphan"`（符號 `?` 黃），留到點掉或 `/telltale agents clear`；不自動刪。
- **主迴圈**：`turn.start` → 開 `kind: "main"` 的 cell（id＝turnId、desc＝text 前 60 字、steps `[prompt]`）；`ui.render{Spinner}` → 記憶體 phase（此 hook 一定 `return next(e)`，不畫），phase ∈ {responding, thinking, requesting} 且最後一個節點不是 `think` → push `think`；`turn.step` → 每個 toolUse push 一個節點；`turn.complete` → push `reply`、`endAt`。**main 歷史（使用者裁定）**：完成的 main cell 收合後不各留一列，而是合併成一列 `✓ N turns · <最近一輪 desc>`，點了展開最近 3 輪 10 s；running 的 main 永遠是獨立 cell。
- **呈現（2026-09-17 定案，DESIGN.md §0–§5）**：一個 cell 一個任務（main 這輪、每個 subagent、每個背景任務），三種樣式 v1／v2／v4 由 `style.agents` 決定（預設：貼側邊 v2、貼上下 v1）。每個 cell 的資料是 `{ id, kind: "main"|"sub"|"bg", label, model?, desc, status, firstAt, endAt?, steps: [{ name, detail?, t0, t1? }] }`；`steps` 由框架從事件累積（§2.6a），面板不再自己排版列，而是交給 Client 的純函式 `renderCell(cell, style, w, h, now, frame, cam)`（`hooks/cells.ts`）。排序：running 先、再 firstAt、再 id；塞不下的 cell 收成 `… +N more`。`rows === 0`（summary 段）只有面板標題列：`⠼ 3 running · 1 done · 1 ✗`。
- **不做 lanes／tree**（訪談淘汰，樣本留 `docs/設計/試衣間-第一輪.html`）。
- **onRow(hit, state)**：failed／killed／orphan → `cells[hit].dismissed = true`；completed → `expanded = hit`（10 s 後自動回 null，由 Client 以 `expandedAt` 判斷）；running → 收合／展開切換。
- **跑馬燈**（使用者裁定）：所有放不下的任務名稱都跑，`MARQUEE_STEP_MS = 300`。
- **首次啟用提示**：`agents.cells` 從無到有的第一次 render，面板標題列尾巴顯示 `/telltale agents style v1|v2|v4` 一次（store 記 `hinted`）。
- **不做也要明講（README）**：純即時顯示、無歷史回放；subagent 內部細節不保證；引擎只給右側 dock 與輸入框上方兩個位置。
- **不做**（DESIGN §5）：hover、狀態歷史鏈、跨 session、降級版。

#### 2.6a 步驟怎麼來（cell.steps）

| 節點 | 事件 |
|---|---|
| `prompt` | `turn.start`（main）；subagent 出現在 `agent.list` 時（`spawned`） |
| `think` | `ui.render{Spinner}` 的 `mode` ∈ {responding, thinking, requesting} 且前一個節點不是 think |
| 工具名 | `turn.step` 的 **result**（`await next(e)` 之後的 `toolUses[]`；2.1.274 的 `TurnStepInput` 沒有 toolUses）（每個 tool use 一個節點；`Bash` 的 `description`／command 前 40 字當 detail）；`Agent` 節點同時開一個 sub cell（description＝input.description） |
| `reply` | `turn.complete`（main）；`agent.list` 的 status 變 completed（sub）；task-notification（bg） |
| 失敗 | status failed／killed；bg 30 min 無通知 → 孤兒 |

subagent 迴圈的 `turn.step` 是否帶 `agentId` 送進來 → 票 16 實測；**退化（只有 `prompt → running → reply` 三節點，動畫全套照用）只有在票 16 附上嘗試紀錄（hook 收到的事件清單＋debug log 片段）證明拿不到之後才算數**，否則票不過。退化時 README 與面板標題要寫「subagent 內部細節不保證」。steps 每 cell 最多存 64 個（舊的合併成 `… ×N`），整個 `agents.cells` 仍受 64 KiB（I5）。

#### 2.7 hello／clock 只在開發模式註冊

`session.start` 內讀 `$.env.get("TELLTALE_DEV")`（`register(on, options)` 當下沒有 `$`）並快取在閉包；等於 `"1"` 才把 hello／clock 放進 PANELS，否則只有 agents。`plugin.json` 的 `userConfig` 刪掉 `panel_hello`／`panel_clock`（沒有公開面板需要種子）。`calls:` 因此多 `$.env.get`（題目白名單本來就有）。第一輪的 register／band 測試改走 `makeRegister([...])` 注入面板，不依賴環境變數。

#### 2.4 面板開關為什麼不用 `userConfig`

2.1.267 的 `userConfig` 只在 enable 時提示一次、`/config` 列要 2.1.269+；而且改 `userConfig` 會**重載整個 module**（題目 §3.5 實測）。開關放 `$.store` 就沒有重載：關掉一個面板只是下一次 render 少畫一塊，DoD #3 直接成立。`plugin.json` 仍宣告 `panel_hello`（`type: "boolean"`, `default: true`）：`session.start` 時 `panels` 鍵缺該 id 才拿 `options["panel_hello"]` 當種子，之後以 store 為準。

#### 2.5 安裝、開發、卸載（README 要寫的）

- 目錄（2026-09-17 使用者裁定「專案結構跟 plugin 結構要拆開」）：repo 根是 marketplace（`.claude-plugin/marketplace.json`，`source: ./plugins/telltale`）＋開發工具；plugin 本體整個在 `plugins/telltale/`（`.claude-plugin/plugin.json`、`hooks/`、README、LICENSE）。本文件所有 `hooks/…` 路徑相對 `plugins/telltale/`；bun 測試與 `harness.ts` 在 `tests/hooks/`（plugin 目錄只放功能）；突變清單在 `tests/突變/`。
- 開發：`--plugin-dir <repo>/plugins/telltale`；正式：`claude plugin marketplace add ryu111/telltale` → `claude plugin install telltale@telltale`；或放 `~/.claude/skills/telltale/`。同名時 `--plugin-dir` 優先。
- 卸載：`claude plugin uninstall telltale` 刪 `${CLAUDE_PLUGIN_DATA}`，但 **`$.store` 的檔（`~/.claude/plugins/store/`）官方文件沒說會刪**——README 寫清楚檔案位置與一行清除指令。plugin 自己不做「卸載時清 store」（沒有這種事件）。

#### 2.8 v0.2b（2026-09-18 真機回饋，使用者裁定；票 24–28）

**標題列按鍵（票 24／27）**：`agents` 面板的 `─ agents ─…─` 標題列右側、`TITLE_RESERVE` 死區左邊，右對齊放一條按鍵帶：`[1 2 3] [S C F] [R B RB] [x]`（各組只在 `BandPanel.buttons` 有對應欄位時出現；票 24 先做 `1 2 3`／`S C F`／`x`，票 27 加 `R B RB`）。目前生效的那顆粗體（tone2 `white`），其餘 `grey`，括號 `greyDeep`；顏色不多載第二種語義（題目 §7.4）。`hooks/hit.ts` 的純函式 `buttonSpans(id, buttons, columns)` 是**唯一**的座標來源（畫與命中同一份，與 `rowsOf` 同一條規則）；放不下（`columns - TITLE_RESERVE < 標題頭寬 + 1 + 帶寬`）就整條不畫、標題列照舊。點擊：`resolveTitleClick(y, x, props, columns)` 先判 `hitPanel`，落在按鍵格 → post 該按鍵的訊息，否則回舊規則（有 stages 的 `stage`、沒有的 `toggle`）。訊息：`{ kind: "style", id, value }` 寫 `style.agents`；`{ kind: "size", id, value }` 直接寫 `size.<id>`（不是循環）；`{ kind: "clear", id }` 同 `/telltale agents clear`；`{ kind: "edge", id, value }` 同 `/telltale agents edge <value>`。按鍵與指令寫同一個鍵（票 11 的規則）。

**樣式預設依 placement（票 24；DESIGN §4「貼側邊→v2，貼上下→v1」一直沒實作）**：`style.agents` 沒存或 `"auto"` 時，`Pane` render 的 `e.props.placement === "dock"` → `v2`，`inline` 與 `AbovePrompt` → `v1`；存了 v1／v2／v4 就照存的。`buildBandProps` 多收 `placement: "dock" | "inline"`；`BandPanel.buttons.style` 是**生效**的樣式（按鍵粗體用它）。

**cell 標題列 tool 次數（票 25）**：`toolCount(cell)` = `steps` 裡 `name ∉ { prompt, think, reply, Agent }` 的個數；≥ 1 時標題列固定段（經過時間之後、任務名稱之前）多一段 ` · N tools`，0 時不顯示（放在固定段而不是尾巴，因為尾巴是跑馬燈、會被擠掉）。main 的歷史合併列 `✓ N turns · …` 不加。

**session 隔離（票 26）**：
- `session.start` 的 `e.isInteractive === false`（`-p`、SDK、Claude Desktop 的 stream-json）→ **整個 plugin 不動**：不寫任何 store 鍵、不 `$.ui.open`、不註冊 tick、觀察型 hook 一律直接 `return next(e)`、`ui.render` 直接 `next(e)`、`command.run` 回 `telltale: idle (headless session)`；只保留 `$.command.register`。真機根因：Desktop 的 4 個 headless 程序每秒 `$.agent.list` 失敗（`not available in this mode: no session is bound`）寫進共用 store，終端機那條帶子讀到就顯示。
- live 資料按 session 分鍵：`agents.cells.<sid>`、`agents.expanded.<sid>`、`error.agents.<sid>`，`<sid>` 來自 `$.session.id()`（transcript 檔名，resume 不變），在 `session.start` 讀一次存進 module 變數。設定鍵（`panels`、`size.*`、`style.agents`、`edge.agents`、`agents.hinted`）仍全域（挑毛病 Q2）。使用者 2026-09-18 裁定：別的 session 的 cell 混進來會看錯。
- 清舊：`session.start` 用 `$.store.keys()` 找 `agents.cells.<other>`，其 cells 最大 `updatedAt` 早於 `now − STALE_SESSION_MS (24 h)`（或空物件）就 `$.store.delete` 它與同 sid 的 `agents.expanded.<sid>`／`error.agents.<sid>`；自己的 `agents.cells.<sid>` 照票 21 設成 `{}`。活著的別人（24 h 內有更新）不動。
- agents 的 tick 成功時**要**寫 `error.agents.<sid> = ""`（舊碼只在 catch 寫、成功不清，一次失敗就永遠顯示）。
- `calls:` 因此多 `$.session.id`、`$.store.keys`、`$.store.delete`（I12 更新；README 貼新輸出並解釋）。

**換邊 auto 退路（票 29；2026-09-18 真機：cmux 裡 Pane 根本不畫，`right` 讓整條帶子消失，使用者裁定「沒存時自動退回上方」）**：`edge.agents` 沒存或 `"auto"` ＝ 想要 `right`，但 **Pane 的 `ui.render` 還沒來過就先由 AbovePrompt 畫全部面板**（module 變數 `paneSeen`，Pane hook 一畫就設 true 並 `invalidate`，之後 AbovePrompt 讓位）。**票 30（2026-09-18 真機：cmux 上點 `R` 帶子消失、按鍵也跟著沒了，使用者裁定「R 也走退路」）：明存 `right` 一樣走這條退路**——`effectiveEdge` 只對 `bottom`、`both` 原樣回，其餘（`right`、`auto`、沒存）都是 `paneSeen ? "right" : "bottom"`；`right` 與 `auto` 只差「有沒有明存」（回報字串、`session.start` 都 open）。`/telltale agents edge` 沒存回 `agents edge: auto`；`agents edge auto` 可寫回。`buttons.edge` 是**生效值**（auto 時 `paneSeen ? "right" : "bottom"`）。

**cell 展開／收合真的畫（票 31；2026-09-18 真機：點 cell 沒反應——票 17 只存了 `cell.collapsed` 與 `agents.expanded.<sid>`，`renderCell` 只看時間、`band.tsx` 也沒拿到 `expanded`）**：`isCollapsed(cell, now, expanded)`＝`cell.collapsed` 為 true → 收合；completed 且過 `COLLAPSE_AFTER_MS` → 收合，**除非** `expanded` 指到它且 `now − expanded.at < EXPANDED_MS`（常數搬到 `cells.ts`，`panels/agents.ts` re-export）。`renderCell` 多一個尾參數 `expanded`（預設 null），三種 style 都走同一個 `isCollapsed`。main 歷史合併列被點開時：第 1 列照舊，接最後 `MAIN_HISTORY_EXPAND = 3` 個 `turn` step 各一列 `  ✓ <elapsed> <detail>`，裁到 h。`buildBandProps` 把 `agents.expanded.<sid>` 帶進 `BandPanel.expanded`（沒存＝`null`），Client 傳給 `renderCell`；到期收合靠既有 1000 ms 幀時鐘，不加新時鐘。

**Pane 用滿、段位有感、沒列名的 sub 會收（票 32；2026-09-18 真機回饋三條，使用者裁定）**：（a）`ui.render{Pane}` 的列數上限不是 `BAND_ROWS_MAX`，是引擎給的 `e.props.scroll.bodyRows`——`layout(wants, maxRows, { status, cap })` 多一個 `cap`（預設 `BAND_ROWS_MAX`，§1.2 規則 3 的「BAND_ROWS_MAX」改讀 `cap`），Pane 站傳 `cap = bodyRows`、`maxRows = bodyRows`；`agents` 的 `wantRows` 在 Pane 站＝`bodyRows − PANEL_TITLE_ROWS`（full＝rest 吃滿）。AbovePrompt 站不變。（b）段位真的改畫法（DESIGN §3）：`summary`＝只有面板標題列（0 列，現況）；`compact`＝每個 cell 只畫標題列一列（`renderCell` 尾參數 `forceCollapsed`，走票 31 的 `isCollapsed` 同一條路，點了才展開 10 s）；`full`＝現況。`BandPanel` 帶 `size`，Client 依它傳 `forceCollapsed`。（c）`applyAgentList` 對 list 裡出現過的 cell 記 `listed: true`；新的 step「沒列名收合」：`kind === "sub"`、running、沒有 `listed`、`now − updatedAt > UNLISTED_IDLE_MS (2 min)` → completed（`endAt = now`，push `reply`）——workflow 的 agent 引擎不列（型別檔 AgentLoop：「carry ids no list names」），通知只有 task id、多個 workflow 分不出誰的，所以用閒置判定。

**換邊三態（票 27）**：`edge.agents ∈ { right, bottom, both }`，沒存視同 `right`（票 29 起：沒存＝auto，見上）。`right`：`session.start` `$.ui.open` Pane，`ui.render{AbovePrompt}` 直接 `return next(e)`（只畫 Pane；窄終端時引擎自己把 Pane 落到輸入框上方）。`bottom`：不 open（已開就 `$.ui.close({ id: "telltale" })`），全部面板由 AbovePrompt 畫，`ui.render{Pane}` 回 `next(e)`。`both`：Pane 只畫 `agents`，AbovePrompt 畫其餘面板（沒有其餘就 `next(e)`）。切換（指令或按鍵）時：寫鍵 → 依新值 open／close → invalidate。top／left 仍回 `not available in this build`。README「引擎只給右側 dock 與輸入框上方兩個位置」那句改成三態說明。

### 3. Pipeline（產品的執行流程）

```
session.start
  ├─ panels ← $.store.get("panels") ⊕ 缺的用 options["panel_<id>"] ?? defaultOn 補 → $.store.set
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

v0.2 追加的 pipeline：

```
session.start
  └─ needsAgents 的面板：io.agents = () => $.agent.list()（包一層，面板拿不到 $）

turn.start / turn.step / turn.complete / ui.render{Spinner} / session.receive{task-notification}
  ├─ 更新 agents.turn ／ agents.tasks ／ pendingSpawns（§2.6）
  ├─ $.ui.invalidate("ui.render")   （turn.*、task-notification 與每秒的 poll 會 invalidate；Spinner 只更新記憶體裡的 phase，不 invalidate）
  └─ return next(e)                  （全部；I13）

ui.message{ kind: "stage" | "view" | "row" }
  └─ 改對應 store 鍵 → $.ui.invalidate

Band(props, surface)
  ├─ surface.every(80)：frame++，重畫 running／抵達中的 cell（renderCell）
  └─ surface.every(1000)：其餘 cell 重算經過時間
```

### 4. 測試 harness（取代不存在的 `claude plugin test`）

`tests/hooks/harness.ts`：

```ts
export const fakeEngine = (opts?: { store?: Record<string, unknown>; now?: number; options?: PluginOptions }) => ({
  $,                 // ui.resolve 回 h-tag 建構子表；ui.invalidate 計數；clock.now 回 opts.now；clock.every 記下 (ms, fn) 讓測試手動 tick；store 讀寫 opts.store（走 JSON round-trip）；command.register 記名
  on,                // 收 register 註冊的 handler，依 (event, matcher) 存
  fire(event, e),    // 呼叫對應 handler，next(e) 回 { text:"" } 或 null 樹
  calls: Record<string, number>,   // 每個 $.noun.method 被呼叫的次數（守 §1.4「都要真的被呼叫」）
});
```

跑法：`bun test tests/hooks/`（bun 讀 `.tsx`、`jsxFactory: h` 由 `tsconfig.json` 給）。`clientOf(tree)` 走樹找 `type === "Client"` 的節點，斷言它的 `props`。

**Client 內部畫的東西測不到**：`band.tsx` 只靠 `hit.ts`、`width.ts` 的純函式測試 + §5.3 tmux 實測。**I7（不重載）與 DoD #3 只有 tmux 實測算數**，fakeEngine 本來就不會重載，它的測試不能拿來當 DoD #3 的證據。

v0.2 追加：fakeEngine 多 `agents: AgentInfo[]`（`$.agent.list` 回它的副本）、`emit(event, input)` 直接打 `turn.*`／`session.receive`／`ui.render{Spinner}` 進 hook 鏈、`env: Record<string,string>`（`$.env.get`）。`renderCell`／`marquee`／`sortCells`／`packetAt`／`cameraTarget` 全是純函式，`now`／`frame` 用參數傳入，不用真時鐘。

### 5. 不變量（不管怎麼實作都不能違反）

| # | 不變量 | 守它的機制 |
|---|---|---|
| I1 | `validate --strict` exit 0，`calls:` 恰好 = §1.4 那七個 | `make check` 跑 validate 並 diff 那一行；每個 op 在流程測試裡 `calls[op] ≥ 1` |
| I2 | `layout()` 的 `total ≤ min(maxRows, BAND_ROWS_MAX)`，且每個 slot `rows ≥ minRows` | 單元測試（含 budget<1、混合 dropped、`maxRows=1`、`maxRows=0`）+ 突變 `Math.min(maxRows, BAND_ROWS_MAX)` → `maxRows` |
| I3 | 被砍的面板出現在 `dropped`，且狀態列印出來；沒 dropped 也沒 error 時**沒有**狀態列（票 23） | 單元測試 + 突變 `dropped` 清空、`status` 永遠 true |
| I4 | 傳給 `Client` 的每一行 `displayWidth ≤ columns`；中文算 2；**而且** `displayWidth ≤ columns` 的字串 `fit` 後原樣 | 單元測試（columns 30 塞中文；恰好等寬的不動）+ 突變 `wide ? 2 : 1` → `1`、`fit` 多扣 1 |
| I5 | `$.store` 總量 < 4 MiB：`data.<id>` 寫入前 `JSON.stringify` 長度 > 64 KiB 就不寫、寫 `error.<id>`；下次成功就清 | 流程測試用假面板回 70 KiB 走過這條路徑（不是只測工具函式） |
| I6 | 重複 poll 無害：同一 `data.<id>` 寫兩次結果一樣 | hello 的 poll 是純的；規約寫在 Panel 契約 |
| I7 | 開關切換不重載 | **tmux 實測**（切片 6）：切換前後 debug log 沒有第二行 `hooks module telltale loaded`、畫面另一面板不閃 |
| I8 | `hasSurvey` 為 true 時回 `next(e)` | 單元測試 |
| I9 | 不 hook `tool.call`／`classic.*`、不宣告 `process.*`／`fs.*`／`http.*`；`hooks.json` 只列一個 module | I1 涵蓋 |
| I10 | 面板 `view` 拿到 `undefined` 也畫（不空白） | 單元測試 |
| I11 | 每個寬度 ≥ MIN_COLUMNS 且 maxRows ≥ 4 時，畫面上至少有一行面板內容（擋「全砍掉就不會超寬」） | 切片 8 的腳本每步斷言 |
| I12（v0.2；v0.2b 票 26 起再加 `$.session.id`、`$.store.keys`、`$.store.delete`，票 27 起加 `$.ui.close`，共十四個） | `calls:` 恰好 = 七個 ＋ `$.agent.list` ＋ `$.env.get` ＋ `$.ui.open`（十個；`$.ui.close` 預留但 v0.2 沒用到，validate 不會列；Pane 需要 open；`$.ui.*` 只畫東西，題目 DoD #1 的字面清單據此擴充，README 要說明）；`hooks:` 恰好 = 第一輪四個 ＋ `turn.start`、`turn.step`、`turn.complete`、`ui.render{component=Spinner}`、`ui.render{component=Pane}`、`session.receive{origin=task-notification}`（十個；恰好的 exact 測試由票 16 收緊，12／13 只驗 ⊆）；仍無 `tool.call`／`classic.*` | I1 的測試改成 v0.2 的兩行 exact；README 區塊同步 |
| I13（v0.2） | 每個 hook 都 `return next(e)`（觀察型 hook 不改任何事件的結果），且每種事件對 `agents.cells` 的寫入內容正確 | 流程測試：每種事件打進去，`next` 恰好一次且回傳 === next 的回傳，**並斷言寫進 store 的 cell 內容**（節點名、t0、desc）；突變：拿掉一個 `return next(e)`、把節點名寫死 |
| I14（v0.2） | `renderCell` 輸出的每一列 `displayWidth ≤ w`，任何 `now`／`frame`／`cam`／style／cell 組合 | 單元＋property 測試（含 w 20、任務名稱全中文、64 步）；突變：elapsed 不裁 |
| I15（v0.2） | 排序穩定：同一組 cells 任何順序輸入，`sortCells` 輸出相同；running 在前，其後依 firstAt，再依 id | property 測試（隨機打亂 50 次，含同 firstAt 的案例） |
| I16（v0.2） | failed／killed／orphan 不會自動消失；completed 60 s 後一定消失、59 s 時一定還在 | 流程測試：假時鐘推 59 s 與 61 s，混雜 failed 與 completed |
| I17（v0.2） | 背景任務 cell 只被同 description 的通知關掉；沒有通知的 30 min 後變孤兒、不刪 | 流程測試 |
| I18（v0.2） | 任何時刻最多一條連線有光點，且只能是最後一個節點抵達中的那條；同一 TRANSIT 窗內兩個不同 now 的光點位置不同（真的在動）；抵達後前一節點名字必為灰（符號保留種類色，DESIGN §2） | property 測試（隨機事件序列＋隨機 now；每個 transit 窗取樣兩次） |

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

### 第二輪功能（v0.2 agents 面板；2026-09-17 訪談；票由 /拆任務 拆）

目標（使用者裁定）：**任何 Claude Code 使用者裝了就有用**——這個 session 正在做的（主迴圈）與背景做的（subagent、背景 shell／Monitor／Workflow）即時變成畫面上的圖，有動畫感、可點、專業的視覺（`docs/DESIGN.md`）。hello／clock 只在 `TELLTALE_DEV=1` 註冊。

| 編號 | 行為（給 X 要得到 Y） | 驗收（硬性、二元） | 評測法 |
|---|---|---|---|
| 10 | `hooks/cells.ts` 基礎純函式：時間格式、`marquee`、`sortCells`、`… +N more`、符號表常數（DESIGN §2／§3 全部符號的唯一來源） | I14／I15 單元＋property；`marquee` 三案例（放得下、放不下、含中文）；**符號表測試**：任何 renderCell 輸出只含符號表＋方框字元＋ASCII＋任務名稱本文；突變：elapsed 裁切、running 優先 | exact＋property |
| 11 | 段位（§1.2 規則 8）＋ `size.<id>` ＋ 標題列點擊改成循環段位；hello／clock 無 stages 仍是開關 | layout 測試：summary→(0,0)、full→rest 仍受 I2；hit 測試：有 stages 的面板點標題 post stage、沒有的 post toggle；**循環順序 summary→compact→full→summary 一測；`/telltale agents size` 與點擊改的是同一個鍵一測** | exact |
| 12 | 觀察型 hooks：`turn.*`、`ui.render{Spinner}`、`session.receive{task-notification}` 寫 `agents.turn`／`agents.tasks`／pendingSpawns；全部 `return next(e)` | I13 流程測試（每事件一測＋next 恰好一次）；I17；validate 的 hooks 行 exact（I12） | exact |
| 13 | agents 面板 poll：`io.agents` 注入、`agents.cells` 生命週期（firstAt／endAt／60 s 清／failed 留／main 歷史合併）、model 對回、`$.env.get("TELLTALE_DEV")` 決定 PANELS | I16；model 配對：三案例＋property（N ≥ 3 同名 pending 仍取最早且每筆只用一次）；main 歷史合併一測；`calls:` exact（I12）；userConfig 刪除後 validate 仍過 | exact＋property |
| 14 | `hooks/cells.ts`：`renderCell` 的 v1／v2／v4 三種靜態排版（標題、任務名稱、方框鏈、直向列表、收合形、main 歷史合併列） | 以 `docs/設計/試衣間.html` 的模擬狀態為 fixture，逐列 exact（w 120／40、h 12／6／3）；**再加 property：隨機生成的 cell（1–64 步、名字 1–30 字含中文、w 20–200、h 2–40）全部滿足 I4 與符號表**；收合形三種各一測 | exact＋property |
| 15 | `hooks/cells.ts` 動態：`packet`（只在抵達中的那條線、600 ms）、`curIx`（抵達前 A 是目前節點）、節點出生（400 ms 打字機＋框展開）、呼吸（600 ms）、鏡頭（橫向 28 欄餘裕＋25% 收斂＋硬貼齊；縱向硬鎖底）、收合（3 s）、消失（60 s）、滑入（500 ms）——全部以 `now`／`frame` 為參數的純函式 | property：任何 now 序列下光點只出現在 `steps[last]` 抵達中的那條線（I18）；鏡頭：最新節點右緣 ∈ [w−28−12, w−28]；時間常數各一測；突變：把 600 改 0、把 MARGIN 改 0 | exact＋property |
| 16 | `band.tsx`：Pane（`$.ui.open`）＋ AbovePrompt 退路、幀時鐘、cell 點擊、`backgroundColor` 實測、subagent `turn.step.agentId` 實測 | tmux：派一個 subagent＋一個背景 Bash → 三個 cell、光點只在新節點抵達時出現（連拍）、完成 3 s 收合、失敗點掉；150→100 欄 Pane 換位置且每列 ≤ columns；每幀全滿 < 5 ms；log 無 `does not validate|hook failed|refused`。**證據格式**：`docs/實測/agents.md` 每一項貼 capture 片段＋對應 debug log 行，DESIGN §6 四項各寫觀察值；沒有貼證據的項目算沒驗 | 手動＋腳本 |
| 17 | `/telltale agents style|edge|size|clear` 與 cell 點擊（展開／收合／點掉） | §1.6 v0.2 表每列一測；onRow 純函式；**展開 10 s 到期自動收合以假時鐘測（exact）**；tmux 點完成的 cell 看展開 | exact＋手動 |
| 18 | README v0.2（validate 兩行更新、agents 面板說明、TELLTALE_DEV、背景任務用 description 配對的限制、孤兒規則、引擎只給兩邊）、寬度 200→30 重跑 | `test_readme` 綠；切片 8 腳本重跑全 ok；CI 綠 | CI＋腳本 |
| 19 | 評估把 harness 搬到 `claude plugin test`（2.1.274 有了，kit `claude-code/testing`）：試搬 `width.test.ts` 一個檔 | 交付物固定：`docs/實測/plugin-test.md` 含指令、退出碼、輸出前 30 行、結論（能／不能＋原因）；缺任一項票不過 | 手動 |

品質條件（樣本＝`docs/設計/試衣間.html` Version 10，使用者 2026-09-17 定案）：
- 「有動畫感」：新節點抵達時那條線 600 ms 內有光點（連拍 3 張至少 2 張不同）、目前節點 600 ms 呼吸、經過時間每秒 +1、鏡頭 25% 收斂不落後。
- 「專業」：顏色語義固定（DESIGN §2）、沒有空白分隔列、任何寬度 ≥ 20 每列 ≤ columns、符號表全部出自 DESIGN §2／§3，沒有表外符號；已完成的節點與 cell 一律壓灰。**這幾條由票 10 的符號表測試與票 14 的 property 測試守，不是人工判斷。**

### 評測法
本專案沒有 LLM 成分，只有 exact match（單元／流程）與手動 tmux 實測；沒有評測層。

## 工具與環境約束（實作者與審查者每張票都會收到這一節）

- 程式碼與註解英文；docs／票中文。
- `claude --plugin-dir "$PWD/plugins/telltale" --debug-file <f>` 開發（旗標已在 settings.json env）；存檔熱重載。平常 `~/.claude/skills/telltale` symlink 自動載入。
- 型別來源：`.claude/types/claude-code.d.ts`（`/plugin-types` 產，不手改；**不進版控**，clone 後自己產）。
- `tsconfig.json` 照型別檔檔頭；含 JSX 的檔一律 `.tsx`。
- 測試：`bun test tests/hooks/`；閘：`make check`（Python 的 scripts 層 + validate + bun test）；突變：`make mutate`（`scripts/突變.py` 對 §5 表的每一條改壞一行跑 `bun test`，全綠即失敗）。
- 不准：`$.process.*`、`$.fs.*`、`$.http.*`、hook `tool.call`／`classic.*`（I9）。v0.2 准的只多 `$.agent.list`、`$.env.get` 與 I12 列的觀察型事件。
- 手動實測用 tmux（題目 §5.3），每次都 grep debug log。

## 挑毛病紀錄

- 第 1 輪（2026-09-17）：三個對抗 agent 共 34 條；定義類 30 條已補進上文（§1.1 view 不回 null、§1.2 規則 1/2/4/7、§1.3 下界、§1.5 columnsHint／TITLE_RESERVE／死區／合併列、§1.6 unchanged／help、§2.1 `error.<id>`、§2.5 卸載、§4 I7 只認 tmux、I11、切片 1/3/5/6/8/9 的驗收加嚴）。偏好類 4 條問使用者：Q1 v0.1 面板數 → hello + clock；Q2 開關多 session 語意 → 全域共用；Q3 hello 的 tone 示範 → 奇偶 up/flat + dim；Q4 全部關掉 → 縮成一列。「AI 補的哪些第一版不要」→ 全部做。
- 第 2 輪起依 `~/.claude/rules/額度.md`（對抗式只跑 1 輪）由主 agent 直接補定義，不再派 agent。**挑毛病：1 輪，未解 0。**
- v0.2（agents 面板）：訪談 2026-09-17 完成（試衣間 10 版，使用者定案 cell＋流程圖＋鏡頭；淘汰 lanes／tree／trace／表格／看板／軌道）。
- v0.2 挑毛病第 1 輪（2026-09-17）：壞心 12／使用者 10／接手 12，共 34 條。定義類 30 條已補：§1.1a 改成單一呈現模型（`renderCell`，淘汰 `live`／`composeLive`）、時間常數具名 export、`agents.cells` 唯一鍵、`Monitor`／`Workflow` 為真實工具名、steps 上限在儲存層、I13／I15／I16／I18 加嚴、票 10／11／13／14／16／17／19 驗收補洞、退化需附嘗試紀錄、同名配對列已知限制。偏好 4 條使用者裁定：退化附紀錄；main 歷史合併成一列；跑馬燈全部跑；孤兒兩級（30 min 久跑、2 h ?）。依 `~/.claude/rules/額度.md` 只跑 1 輪。
