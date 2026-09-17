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

#### 1.1a v0.2 擴充：動態列與框架注入的資料源

面板仍是純函式，但 agents 面板有兩件事第一輪的契約裝不下：**每幀要動的東西**（spinner、經過時間、時序 bar）與**資料不是 poll 回傳的 JSON 而是引擎的即時清單**。擴充如下，舊面板不受影響（欄位都是 optional）：

```ts
export type Live = {
  spinner?: boolean;                    // 前綴轉 braille spinner（Client 幀時鐘，80 ms）
  sinceAt?: number;                     // 有值就在列尾畫 elapsed = now - sinceAt，每秒跳
  lane?: { startAt: number; endAt?: number }; // 有值就在 text 與 elapsed 之間畫時序 bar（視窗 LANE_WINDOW_MS = 60_000）
  flashUntil?: number;                  // now < flashUntil 時整列粗體（狀態剛切換 1 s）
};
export type PanelLine = { text: string; tone?: Tone; live?: Live; hit?: string }; // hit：這列可點，點了 post { kind: "row", id, hit }

export type PanelIo = {
  now: () => number;
  agents?: () => Promise<AgentInfo[]>;   // 框架包 $.agent.list；只有宣告 needsAgents 的面板拿得到
  activity?: () => Activity;             // 框架在記憶體裡維護的主迴圈／背景任務狀態（§2.6），同步讀
};
export type Panel<D> = { ...第一輪欄位...; needsAgents?: boolean; stages?: Stages }; // Stages 見 §1.2 規則 8
```

- `live` 的**組合**（spinner ＋ text ＋ bar ＋ elapsed 裁到 columns）是純函式 `composeLive(line, now, frame, columns): string`，住 `hooks/live.ts`，Client 每幀呼叫；hooks module 不參與動畫，所以 `$.ui.invalidate` 仍是每秒一次（agents poll）。
- `hit` 讓一列可點：Client 用 `rowsOf` 同一套列數推算命中，post `{ kind: "row", id: <panel>, hit: <string> }` 給 `ui.message`；面板在 `onRow?(hit, state) => state` 純函式裡決定意思（agents：展開／收合／點掉失敗列）。

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
3. 依 `panels` 順序，每個面板先拿 `PANEL_TITLE_ROWS (=1) + minRows`（從 `budget` 扣；那一列是 §1.5 的 `─ label ─` 標題列，**票 06 實測漏算過，狀態列蓋掉了 clock 的標題**）；扣不起的整個進 `dropped`，**不畫半個**，繼續看下一個（後面較小的面板仍可能塞進去）。
4. 第一輪分完剩下的列，再依順序補到各面板的 `wantRows` 為止；補不完就留白（`total` 可以小於上限，用 `≤` 不用 `=`）。
5. `total = FIXED_ROWS + Σ (PANEL_TITLE_ROWS + slots.rows) ≤ min(maxRows, BAND_ROWS_MAX)`（規則 2 的情況除外，那時 `total ≤ FIXED_ROWS`）。`slot.rows` 是內容列數，不含標題列。
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
- 末列（狀態列）：`dropped` 非空 → `⋯ git, trace not shown (height)`；有面板 `error` → `hello: data too large`；否則 `updated Ns ago`，N = `now - max(panels[].at)`（顯示中最新的那個）。
- `tone` → 顏色：`up` 綠、`down` 紅、`flat` 預設色、`dim` dimColor。只表達嚴重度，不閃、不加粗（題目 §7.4）。
- **每次呼叫都重掛 `surface.onPointer`**（回呼裡只讀 `surface.state`、不讀閉包）。點擊 = `down` 後同一格 `up`；落在某面板標題列且 `x < columns - TITLE_RESERVE` → `surface.post({ kind: "toggle", id })`。最右 4 欄是死區（README 寫明）。hover 不做。
- **這個檔的輸出沒有自動測試守著**（Client 在繪製執行緒）；命中判定 `hitPanel(y, panels): string | null` 抽到 `hooks/hit.ts` 純函式去測（列數從 `props.total` 與各 `rows` 算，跟畫的用同一個函式 `rowsOf(props)`，不許兩份）。

v0.2 追加（Client）：

- **點面板標題列**：v0.2 起＝**循環段位**（summary → compact → full → summary），post `{ kind: "stage", id }`；不再是開關。開關只剩 `/telltale <id> [on|off]`。沒有 `stages` 的面板（hello／clock）點標題仍是開關（相容第一輪 DoD #3 的實測與測試）。
- **標題列最右的視圖字樣**（`lanes`／`tree`，寬 5，在 TITLE_RESERVE 死區左側）點了 post `{ kind: "view", id }`。
- **內容列**：`PanelLine.hit` 有值的列可點，post `{ kind: "row", id, hit }`。
- **動畫**：Client 用 `surface.every(80, …)` 走幀計數，只重畫有 `live` 的列；`surface.every(1000, …)` 讓 elapsed 與 lanes bar 每秒更新。每幀繪製量要量：全滿 7 列 × 150 欄的 `composeLive` 必須 < 5 ms（ClientModule 超時會被卸載，題目 §3.4）。
- 狀態切換高亮：面板在 view 裡給 `flashUntil = at + 1000`，Client 只看時間，不記狀態。

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
| `/telltale agents view` | `agents view: lanes`（目前值） |
| `/telltale agents view lanes` ／ `tree` | `agents view: lanes → tree`；相同回 `(unchanged)` |
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
| `view.agents` | `"lanes" \| "tree"` | view 訊息、`/telltale agents view` |
| `agents.seen` | `{ [agentId]: { firstAt, endAt?, model?, dismissed?: true } }`；60 s 前結束且非 failed／killed 的條目在下一次 poll 時清掉 | agents 的 poll（框架代寫） |
| `agents.tasks` | `{ [key]: { kind: "shell"\|"monitor"\|"workflow", description, startAt, endAt?, dismissed?: true } }`，key = `${startAt}-${description}` | `turn.step`／`session.receive` hook |
| `agents.turn` | `{ turnId, startedAt, endedAt?, phase, tools: string[], prompt: string(≤60) }` | `turn.*`／`ui.render{Spinner}` hook |
| `agents.expanded` | `agentId \| null` | row 訊息 |

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
- **poll**（每秒）：`io.agents()` → 對照 `agents.seen`：新 id 記 `firstAt = now`；status 從 running 變成其他記 `endAt = now`、`flashUntil = now + 1000`；`completed` 且 `now - endAt > 60_000` 的刪；failed／killed 留到 `dismissed`。回傳的 data ＝ `{ at, agents: AgentInfo[], seen, tasks, turn, expanded }`（框架把 `seen`／`tasks`／`turn` 從 store 併進來）。
- **model 對回去**：`turn.step` 看到 `Agent` 工具 input（`description`、`model?`、`subagent_type`）就記到 `agents.pendingSpawns`（記憶體，不進 store）；下一次 poll 出現的新 agent 若 `description` 相同，取最早一筆的 `model` 寫進 `seen[id].model`，配不到就空。
- **背景任務**：`turn.step` 的 toolUses 裡 `Bash{ run_in_background: true }` → `tasks` 開 `shell`（description 取 input.description，缺就 command 前 40 字）；`Monitor` → `monitor`；`Workflow` → `workflow`。`session.receive{origin=task-notification}` 的 text 用 regex `Background command "([^"]+)" completed|Task "([^"]+)"|Workflow "([^"]+)"` 抓 description，關掉最早一條同名未結束的 task（`endAt = now`）。30 min 沒關的標孤兒（tone 黃、符號 `?`），點掉或 `/telltale agents clear` 才收；不自動刪。
- **主迴圈**：`turn.start` → `agents.turn = { turnId, startedAt: now, phase: "responding", tools: [], prompt }`；`ui.render{Spinner}` → `phase = e.props.mode`（此 hook 一定 `return next(e)`，不畫）；`turn.step` → `tools = toolUses.map(name)`（最多存 8）；`turn.complete` → `endedAt = now`。60 s 後主迴圈列顯示 `idle`。
- **view(data, columns, rows)**：`data.view`（lanes／tree）決定排版，兩種都走同一組純函式：`sortAgents`（running 先、再 firstAt、再 id：穩定）、`collapseLeaves`（同父＋葉＋type＋status 相同 → `type ×N`；只在 rows 不夠時做，做到塞得下或無可合併為止）、`fitRows`（仍不夠：MAIN 永遠在、running 全留、已結束的依 endAt 早的先收成 `… +N done`）。每列 `live` 依 DESIGN §1；`hit = agentId`（失敗列 hit 也是 id，onRow 依 status 決定是 dismiss 還是 expand）。`rows === 0`（summary 段）回空 lines，摘要由 `title(data)` 回：`⠼ 3 running · 1 done · 1 ✗`（spinner 由 Client 動）。
- **onRow(hit, state)**：failed／killed → `seen[hit].dismissed = true`；其他 → `expanded = expanded === hit ? null : hit`。
- **不做**（DESIGN §5）：hover、狀態歷史鏈、跨 session、降級版。

#### 2.7 hello／clock 只在開發模式註冊

`register` 時讀 `$.env.get("TELLTALE_DEV")`；等於 `"1"` 才把 hello／clock 放進 PANELS，否則只有 agents。`plugin.json` 的 `userConfig` 刪掉 `panel_hello`／`panel_clock`（沒有公開面板需要種子）。`calls:` 因此多 `$.env.get`（題目白名單本來就有）。第一輪的 register／band 測試改走 `makeRegister([...])` 注入面板，不依賴環境變數。

#### 2.4 面板開關為什麼不用 `userConfig`

2.1.267 的 `userConfig` 只在 enable 時提示一次、`/config` 列要 2.1.269+；而且改 `userConfig` 會**重載整個 module**（題目 §3.5 實測）。開關放 `$.store` 就沒有重載：關掉一個面板只是下一次 render 少畫一塊，DoD #3 直接成立。`plugin.json` 仍宣告 `panel_hello`（`type: "boolean"`, `default: true`）：`session.start` 時 `panels` 鍵缺該 id 才拿 `options["panel_hello"]` 當種子，之後以 store 為準。

#### 2.5 安裝、開發、卸載（README 要寫的）

- 目錄（2026-09-17 使用者裁定「專案結構跟 plugin 結構要拆開」）：repo 根是 marketplace（`.claude-plugin/marketplace.json`，`source: ./plugins/telltale`）＋開發工具；plugin 本體整個在 `plugins/telltale/`（`.claude-plugin/plugin.json`、`hooks/`、README、LICENSE）。本文件所有 `hooks/…` 路徑相對 `plugins/telltale/`；bun 測試與 `harness.ts` 在 `tests/hooks/`（plugin 目錄只放功能）；突變清單在 `tests/突變/`。
- 開發：`--plugin-dir <repo>/plugins/telltale`；正式：`claude plugin marketplace add ryu111/telltale` → `claude plugin install telltale@telltale`；或放 `~/.claude/skills/telltale/`。同名時 `--plugin-dir` 優先。
- 卸載：`claude plugin uninstall telltale` 刪 `${CLAUDE_PLUGIN_DATA}`，但 **`$.store` 的檔（`~/.claude/plugins/store/`）官方文件沒說會刪**——README 寫清楚檔案位置與一行清除指令。plugin 自己不做「卸載時清 store」（沒有這種事件）。

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
  ├─ $.ui.invalidate("ui.render")   （turn.* 與 task-notification 才 invalidate；Spinner 每 2 s 已被 poll 覆蓋，不 invalidate）
  └─ return next(e)                  （全部；I13）

ui.message{ kind: "stage" | "view" | "row" }
  └─ 改對應 store 鍵 → $.ui.invalidate

Band(props, surface)
  ├─ surface.every(80)：frame++，只重畫 live.spinner 的列
  └─ surface.every(1000)：重算 elapsed 與 lanes bar
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

v0.2 追加：fakeEngine 多 `agents: AgentInfo[]`（`$.agent.list` 回它的副本）、`emit(event, input)` 直接打 `turn.*`／`session.receive`／`ui.render{Spinner}` 進 hook 鏈、`env: Record<string,string>`（`$.env.get`）。`composeLive`／`laneBar`／`sortAgents`／`collapseLeaves`／`fitRows` 全是純函式，直接測；動畫的幀計數用參數傳入，不用真時鐘。

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
| I12（v0.2） | `calls:` 恰好 = 七個 ＋ `$.agent.list` ＋ `$.env.get`；`hooks:` 恰好 = 第一輪四個 ＋ `turn.start`、`turn.step`、`turn.complete`、`ui.render{component=Spinner}`、`session.receive{origin=task-notification}`；仍無 `tool.call`／`classic.*` | I1 的測試改成 v0.2 的兩行 exact；README 區塊同步 |
| I13（v0.2） | 每個 hook 都 `return next(e)`（觀察型 hook 不改任何事件的結果） | 流程測試：每種事件打進去，`next` 被呼叫恰好一次且 hook 回傳 === next 的回傳；突變：拿掉一個 `return next(e)` |
| I14（v0.2） | `composeLive` 輸出的 `displayWidth ≤ columns`，任何 `now`／`frame`／`live` 組合 | 單元測試（含 columns 20、label 全中文、bar 視窗 0 寬）；突變：elapsed 不裁 |
| I15（v0.2） | 排序穩定：同一組 agents 任何順序輸入，`sortAgents` 輸出相同；running 永遠在已結束之前 | property 測試（隨機打亂 50 次） |
| I16（v0.2） | failed／killed 不會自動消失；completed 60 s 後一定消失 | 流程測試：假時鐘推 61 s |
| I17（v0.2） | 背景任務 lane 只被同 description 的通知關掉；沒有通知的 30 min 後變孤兒、不刪 | 流程測試 |

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
| 10 | 純函式層：`hooks/live.ts`（`composeLive`、`laneBar`、時間格式）、`hooks/agents-model.ts`（`sortAgents`、`collapseLeaves`、`fitRows`） | I14／I15 單元＋property 測試；DESIGN §1 每個符號與時間格式各一測；突變：bar 視窗、elapsed 裁切、running 優先 | exact＋property |
| 11 | 段位（§1.2 規則 8）＋ `size.<id>` ＋ 標題列點擊改成循環段位；hello／clock 無 stages 仍是開關 | layout 測試：summary→(0,0)、full→rest 仍受 I2；hit 測試：有 stages 的面板點標題 post stage、沒有的 post toggle | exact |
| 12 | 觀察型 hooks：`turn.*`、`ui.render{Spinner}`、`session.receive{task-notification}` 寫 `agents.turn`／`agents.tasks`／pendingSpawns；全部 `return next(e)` | I13 流程測試（每事件一測＋next 恰好一次）；I17；validate 的 hooks 行 exact（I12） | exact |
| 13 | agents 面板 poll：`io.agents` 注入、`agents.seen` 生命週期（firstAt／endAt／60 s 清／failed 留）、model 對回、`$.env.get("TELLTALE_DEV")` 決定 PANELS | I16；model 配對三案例（配到、配不到、同名兩個取最早）；`calls:` exact（I12）；userConfig 刪除後 validate 仍過 | exact |
| 14 | agents view：tree 排版（主迴圈流程列、樹、聚合、fitRows）＋ `title(data)` 摘要 | DESIGN §3.2 的圖逐列 exact（columns 120、rows 6）；rows 3／1／0 各一案例；I4 | exact |
| 15 | agents view：lanes 排版（bar、刻度列只在 full）＋ `/telltale agents view|size|clear` | DESIGN §3.1 的圖逐列 exact；§1.6 v0.2 表每列一測 | exact |
| 16 | `band.tsx`：幀時鐘動畫、`live` 列重畫、row／view／stage 點擊、flash | tmux：派一個 subagent＋一個背景 Bash → 兩條 lane 出現、spinner 在轉（連拍 3 張 capture 字元不同）、結束後 `✓` 60 s 後消失、失敗列點掉；每幀 `composeLive` 全滿量 < 5 ms（log 或 `ui.log` 印）；debug log 無 `does not validate|hook failed|refused` | 手動＋腳本 |
| 17 | 詳情展開（row 點擊）、失敗列 dismiss、`agents.expanded` 單一 | onRow 純函式測試；tmux 點兩列只展開一列 | exact＋手動 |
| 18 | README v0.2（validate 兩行更新、agents 面板說明、TELLTALE_DEV、背景任務用 description 配對的限制、孤兒規則）、DESIGN.md 定稿、寬度 200→30 重跑 | `test_readme` 綠；切片 8 腳本重跑全 ok；CI 綠 | CI＋腳本 |

品質條件（DESIGN.md 是參考樣本；挑毛病前使用者要在 DESIGN §4 選風格 A／B／C）：
- 「有動畫感」的可觀察定義：running 列 spinner 每 80 ms 換字元（tmux 連拍 3 張至少 2 張不同）、elapsed 每秒 +1、狀態切換那列 1 s 內粗體。
- 「專業」的可觀察定義：顏色只表嚴重度（DESIGN §0-1）、沒有空白分隔列、任何寬度 ≥ 20 每列 ≤ columns、符號表全部出自 DESIGN §1，沒有表外符號。

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
- v0.2（agents 面板）：訪談 2026-09-17 完成，**挑毛病：待跑**（使用者先選 DESIGN §4 風格）。
