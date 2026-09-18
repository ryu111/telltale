# Graph Report - telltale  (2026-09-18)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 952 nodes · 1669 edges · 84 communities (59 shown, 24 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 9 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `896a1528`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 55
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- Community 63
- Community 64
- Community 65
- Community 66
- Community 67
- Community 68
- Community 69
- Community 70
- Community 71
- Community 72
- Community 73
- Community 74
- Community 75
- Community 76
- Community 77
- Community 78
- Community 79
- Community 80
- Community 81
- Community 83

## God Nodes (most connected - your core abstractions)
1. `_跑()` - 29 edges
2. `registerHooks()` - 25 edges
3. `renderCell()` - 24 edges
4. `displayWidth()` - 23 edges
5. `fakeEngine` - 21 edges
6. `跑票` - 19 edges
7. `Cell` - 18 edges
8. `fit()` - 18 edges
9. `clientOf()` - 17 edges
10. `runTelltale()` - 16 edges

## Surprising Connections (you probably didn't know these)
- `bootDev()` --calls--> `register()`  [EXTRACTED]
  tests/hooks/agents.test.ts → plugins/telltale/hooks/register.tsx
- `boot()` --calls--> `register()`  [EXTRACTED]
  tests/hooks/empty-stub.test.ts → plugins/telltale/hooks/register.tsx
- `boot()` --calls--> `register()`  [EXTRACTED]
  tests/hooks/observe.test.tsx → plugins/telltale/hooks/register.tsx
- `boot()` --calls--> `makeRegister()`  [EXTRACTED]
  tests/hooks/buttons.test.tsx → plugins/telltale/hooks/register.tsx
- `boot()` --calls--> `makeRegister()`  [EXTRACTED]
  tests/hooks/edge-auto.test.tsx → plugins/telltale/hooks/register.tsx

## Import Cycles
- None detected.

## Communities (84 total, 24 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (62): effectiveEdge(), BAND_ROWS_MAX, computeWithFixed(), CONTENT_ROWS_MAX, FIXED_ROWS, layout, MIN_COLUMNS, nextStage() (+54 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (30): Exception, main(), Any, Path, 驗收測試若在 `測試骨架/` 有同名 `.txt`（檔名以 `<測試檔名>.txt` 結尾），內容必須一字不差。 沒骨架的測試不管；有骨架但內容不同 =…, 只留 FAILED／ERROR／E 行。 餵回實作者的是「哪支測試、什麼斷言」，不是整段輸出，免得它迎合錯誤訊息。, diff 直接塞進審查 prompt，省它自己跑 git 那一回合；太長就截，並說明截了多少。, 唯一碰 subprocess 的地方；測試換成假的。 (+22 more)

### Community 2 - "Community 2"
Cohesion: 0.11
Nodes (33): Any, Path, 跑票.py 的題目：假執行器，不開 git、不開 CLI。守的是「哪一站停、停的理由、發出去的指令」。, 依 argv 回固定劇本；記下每一條指令。, 主目錄看 main_tests_rc；worktree 實作前看 紅檢查_rc、實作後看 wt_tests_rc。, test_merge後刷新額度快照(), test_mutate紅就停(), test_pr路徑_merge從主目錄跑_push與create在worktree_最後仍刪本地分支() (+25 more)

### Community 3 - "Community 3"
Cohesion: 0.10
Nodes (35): Band(), BandState, buildCellRows(), buildRows(), cellsOf(), CellsPanel, hasActiveCell(), isActiveCell() (+27 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (32): 0.1 第二輪追加（2026-09-17，spike 實測：`scratchpad/spike/probe.tsx`，一次真的派 Explore subagent＋背景 Bash）, 0. 與題目衝突的事實（對照 `.claude/types/claude-code.d.ts`，Claude Code 2.1.267）, 1.1 面板（`hooks/panels/*.ts`）：純資料＋純函式，拿不到 `$`、拿不到 surface, 1.1a v0.2 擴充：cell 面板與框架注入的資料源（挑毛病後改寫：只有一套呈現模型）, 1.2 版面調度（`hooks/layout.ts`）：框架核心，純函式，只管高度, 1.3 顯示寬度（`hooks/width.ts`）：純函式, 1.4 hooks module（`hooks/register.tsx`）：唯一碰 `$` 的地方, 1.5 surface module（`hooks/band.tsx`）：畫＋滑鼠，跑在繪製執行緒 (+24 more)

### Community 5 - "Community 5"
Cohesion: 0.12
Nodes (26): AGENTS_SIZES, AGENTS_STYLES, agentsClear(), agentsCommand(), agentsSet(), AgentsView, CLEARABLE, clearDismissable() (+18 more)

### Community 6 - "Community 6"
Cohesion: 0.14
Nodes (22): BIRTH_MS, BREATHE_MS, CAMERA_GAIN, CAMERA_MARGIN, cameraTarget(), Col, easeCamera(), EDGE_W (+14 more)

### Community 7 - "Community 7"
Cohesion: 0.11
Nodes (23): main(), Any, Path, 執行器型, 跑全部票：一個 feature 目錄下的票依編號與依賴順序全部跑完，攢成一份報告。長跑用。 make tickets…, NN-<slug>.md 的 NN；沒有就空字串。, 「依賴（Blocked by）：01, 02」→ ["01","02"]；「無」→ []。, 唯一碰 subprocess 的地方；測試換成假的。 (+15 more)

### Community 8 - "Community 8"
Cohesion: 0.07
Nodes (28): 0. 專案, 10. 回報什麼, 1. 你要做什麼（Definition of Done）, 2. 為什麼是「一個 plugin 多個面板」而不是「多個 plugin」, 3.1 啟用與載入, 3.2 型別檔是唯一事實來源, 3.3 render site 的硬限制, 3.4 Client：唯一有滑鼠與鍵盤的路 (+20 more)

### Community 9 - "Community 9"
Cohesion: 0.14
Nodes (24): main(), Path, 執行器型, 突變：對「這個行為很重要」的每一行，故意改壞、跑 bun test、要求它轉紅、改回來。 make mutate # 讀…, 一個 .json 檔，或一個目錄（裡面每個 .json 依檔名排序串起來：一票一檔，並行不撞）。 沒有檔 = 空清單；有檔但欄位缺 = 清單壞，直接…, 唯一碰 subprocess 的地方；測試換成假的。, 回 True = 轉紅（有人守）；False = 全綠（沒人守）；None = 清單壞（old 不是恰好一次）。, 套用一條() (+16 more)

### Community 10 - "Community 10"
Cohesion: 0.10
Nodes (18): Cell, COLLAPSE_AFTER_MS, compressSteps(), Expanded, EXPANDED_MS, MAIN_HISTORY_EXPAND, MAIN_HISTORY_ID, ORPHAN_MS (+10 more)

### Community 11 - "Community 11"
Cohesion: 0.20
Nodes (25): arrivingBoxWidth(), borderTone(), buildV1Chain(), colsToLine(), colsWidth(), curIx(), edgeTone(), fitLeft() (+17 more)

### Community 12 - "Community 12"
Cohesion: 0.15
Nodes (18): Stages, PendingSpawn, AgentInfo, CellsView, Panel, PanelIo, PanelLine, PanelView (+10 more)

### Community 13 - "Community 13"
Cohesion: 0.11
Nodes (11): CameraState, CellLine, STRIP_W, SYMBOLS, Tone2, TOOL_EXCLUDED, toolCount(), fixture (+3 more)

### Community 14 - "Community 14"
Cohesion: 0.13
Nodes (14): 10-cells 基礎：`hooks/cells.ts` 的純函式底座（時間、跑馬燈、排序、符號表）, `compressSteps(steps: readonly Step[]): Step[]`, `fitCells(cells: readonly Cell[], budget: number): { shown: Cell[]; hidden: Cell[] }`, `formatElapsed(ms: number): string`, `isCollapsed(cell: Cell, now: number): boolean`, `isVanished(cell: Cell, now: number): boolean`, `marquee(text: string, w: number, now: number): string`, `sortCells(cells: readonly Cell[]): Cell[]` (+6 more)

### Community 15 - "Community 15"
Cohesion: 0.13
Nodes (14): 14-renderCell：`hooks/cells.ts` 的 v1／v2／v4 靜態排版, Fixture（逐列 exact；`docs/設計/試衣間.html` 的模擬狀態當參考，但本票用可手算的簡化版本，複雜的多節點／捲動／running 狀態留 `test.todo` 給實作對照 試衣間.html 現場核對——見骨架檔）, Header 組成（v1／v4 共用第 1 列；v2 的 `┌ ... ┐` 列用同一份文字，只是包框）, main 歷史合併列（獨立於 `renderCell` 的小函式，避免硬把「合併後的假 cell」塞進 `Cell` 型別）, Property 測試（I4；隨機生成，固定 seed，不裝 fast-check）, Tone2 對照表（DESIGN §2／§3 → `Tone2`；這是唯一的對照來源，`renderCell` 不用表外的顏色邏輯）, v2 直向列表, 三種樣式（DESIGN §1 對照 `docs/設計/試衣間.html`） (+6 more)

### Community 16 - "Community 16"
Cohesion: 0.13
Nodes (12): ELEMENTS, FakeAgentInfo, FakeDollar, FakeEngineOpts, Hook, JsxTag, Matcher, Next (+4 more)

### Community 17 - "Community 17"
Cohesion: 0.38
Nodes (13): CompletedProcess, Path, 範圍 hook 是保證，不是提醒：用真的 stdin JSON 跑腳本，看退出碼。, test_允許清掉指針本身(), test_前綴繞不過_整串比對(), test_指針指到不存在的票_大聲失敗不放行(), test_沒有指針就放行(), test_清單內放行_glob也算() (+5 more)

### Community 18 - "Community 18"
Cohesion: 0.14
Nodes (13): 15-動態：`hooks/cells.ts` 的時間驅動效果（光點、出生、呼吸、鏡頭、收合、消失、滑入）, `cameraTarget(stripW: number, w: number): number`, `curIx(cell: Cell, now: number): number`, `easeCamera(cur: number, target: number): number`, `isBreathing(now: number): boolean`, `isFlashing(cell: Cell, now: number): boolean`, `packetAt(cell: Cell, edgeLen: number, now: number): number | null`, Property 測試（I18；固定 seed，不裝 fast-check） (+5 more)

### Community 19 - "Community 19"
Cohesion: 0.14
Nodes (12): Design tradeoffs, Install, Known limitations, telltale, `/telltale`, The `agents` panel, What this plugin can touch, Develop (+4 more)

### Community 20 - "Community 20"
Cohesion: 0.21
Nodes (13): _dock帶子(), _inline框帶子(), main(), 量一份 tmux capture 裡帶子每一列的顯示寬度（東亞寬字算 2）。 uv run python scripts/量寬度.py…, 東亞寬字（W／F）算 2，控制字元 0，其餘 1。, 整列只有 `─`（至少 10 格）＝輸入框上方的分隔線，不是帶子的。, 窄終端：Pane 落到輸入框上方，整塊被 `╭─╮…╰─╯` 框住。, 寬終端：Pane 靠右 dock，帶子在某一欄之後的 `│` 右側往下延伸。 (+5 more)

### Community 21 - "Community 21"
Cohesion: 0.14
Nodes (12): Path, 量寬度.py 的題目：三種帶子型態（裸／dock／inline）都要抓到，量到的寬度不能超欄。, 寬終端 Pane 靠右 dock：帶子在某一欄後的 `│` 右側，不是裸列。, 窄終端 Pane 落到輸入框上方：整塊被 `╭─╮…╰─╯` 框住。, 對照票 18 實測：80 欄的 inline 框每列 ≤ 80，且有面板內容，回 ok。, 三種偵測法都失敗時，回 none 與空列表（帶子 not found，不是誤判超寬）。, 票 23：沒 dropped／error 就沒有狀態列；帶子到分隔線（整列 ─）前為止，不把提示列算進去。, test_dock型態() (+4 more)

### Community 22 - "Community 22"
Cohesion: 0.14
Nodes (13): compilerOptions, jsx, jsxFactory, jsxFragmentFactory, lib, module, moduleResolution, noEmit (+5 more)

### Community 23 - "Community 23"
Cohesion: 0.32
Nodes (10): buttonTitleRow(), panelTitleLine(), sliceByWidth(), renderMainHistory(), displayWidth(), fit(), isControl(), isWide() (+2 more)

### Community 24 - "Community 24"
Cohesion: 0.24
Nodes (9): TitleButtons, makeRegister(), boot(), boot(), boot(), panelIds(), fakeEngine, roundTrip() (+1 more)

### Community 25 - "Community 25"
Cohesion: 0.18
Nodes (10): 1. subagent 的 `turn.step` 是否帶 `agentId`, 2. `Text` 的 `backgroundColor` 在 Pane 是否生效, 3. 每幀繪製成本 < 5 ms, 4. Pane 在 150→100 欄換位置, item 1（真資料，票 17 補測）, 前置說明：agents 面板目前還不餵真的 cells, 完成條件檢查, 實測：agents 面板 / band.tsx 的 Pane 雙路（票 16，DESIGN §6） (+2 more)

### Community 26 - "Community 26"
Cohesion: 0.20
Nodes (9): 11-段位：`stages`／`size.<id>` ＋ 標題列點擊改成循環段位, `command.ts` 修改, `hit.ts` 新增, `layout.ts` 新增, `register.tsx` 修改, 介面缺口先講清楚, 突變（寫進 `tests/突變/11-段位.json`）, 題目 (+1 more)

### Community 27 - "Community 27"
Cohesion: 0.22
Nodes (3): 票 18：README v0.2。 validate 區塊、agents 面板說明、TELLTALE_DEV、已知限制；寬度腳本重跑留痕；CI 不倒退。…, test_readme_的validate區塊與當前輸出一致(), _validate_notes()

### Community 28 - "Community 28"
Cohesion: 0.22
Nodes (7): Agent skills, Domain docs, Issue tracker, 專案級 hook（`.claude/hooks/`）, 起手式, 這個 repo 的坑, 這個專案是什麼

### Community 29 - "Community 29"
Cohesion: 0.36
Nodes (8): main(), Path, PreToolUse（Edit|Write）：實作只准動目前 task 的「可碰檔案」。 介面： - 指針檔 docs/tasks/目前：一行，目前 task…, 任一 glob 整串命中即可；整串比對，`mutants/src/x.py` 不會被 `src/x.py` 放行。, stdin 是 hook 的 JSON；沒指針放行，範圍外 exit 2。, 可碰清單(), 在範圍內(), _擋()

### Community 30 - "Community 30"
Cohesion: 0.22
Nodes (8): 0. 一句話, 1. 三種 cell 樣式（`/telltale agents style v1|v2|v4`）, 2. 節點種類與顏色, 3. 動態（全部樣式共用；時間常數是定義的一部分）, 4. 面板貼哪一邊、開合, 5. 點擊, 6. 真機要驗（票 16）, DESIGN：agents 面板（telltale v0.2）— 2026-09-17 定案

### Community 31 - "Community 31"
Cohesion: 0.22
Nodes (8): 12-觀察hooks：`turn.*`／`ui.render{Spinner}`／`session.receive{task-notification}` 寫 `agents.cells`, harness 擴充（本票要做，骨架測試依賴它；`tests/hooks/harness.ts` 是測試基礎設施，不是驗收測試）, `hooks/observe.ts`（新，純函式，不 import `claude-code` 值、不碰 `$`）, `hooks/register.tsx` 加五個 hook, 型別上的兩個地雷（實測型別檔，寫死在這裡，不要重新猜）, 已知落差（回報，不在本票解）, 突變, 題目

### Community 32 - "Community 32"
Cohesion: 0.22
Nodes (8): 17-agents 指令與點擊：`/telltale agents style|edge|size|clear`、`onRow`, `hooks/command.ts`：`TelltaleResult` 加 `writes`, `hooks/panels/agents.ts`：`onRow`, `hooks/register.tsx`：`command.run` 接 `writes`；`ui.message` 接 `{ kind: "row" }`, 已知落差（回報）, 票 16 實測留給本票的接線（必做，不然 agents 面板永遠是 `agents · 0 cells`）, 突變, 題目

### Community 33 - "Community 33"
Cohesion: 0.22
Nodes (5): agentsOf(), agentsPanel, BTN, helloPanel, props

### Community 34 - "Community 34"
Cohesion: 0.25
Nodes (7): metadata, description, name, owner, name, plugins, $schema

### Community 35 - "Community 35"
Cohesion: 0.25
Nodes (7): 13-agents 面板：poll 生命週期、model 配對、main 歷史合併、`TELLTALE_DEV` 決定 `PANELS`, `hooks/panels/agents.ts`, `hooks/panels/index.ts`／`register.tsx`：`TELLTALE_DEV`, 已知落差（回報）, 本票對 SDD 的兩個必要澄清（回報，不是自由發揮）, 突變, 題目

### Community 36 - "Community 36"
Cohesion: 0.25
Nodes (7): 24-標題列按鍵：agents 標題列右側 `[1 2 3] [S C F] [x]`，樣式預設依 placement, band.tsx, command.ts, hit.ts（純函式，畫與命中的唯一座標來源）, README, register.tsx, 題目

### Community 37 - "Community 37"
Cohesion: 0.25
Nodes (7): plugin-test 評估（票 19，2026-09-17）, 已知落差（相對 SDD §0.1 與本票假設的落差，實測後回報）, 指令, 結論, 輸出（前 30 行）, 退出碼, 遺留（範圍外，留給 v0.3 立項）

### Community 38 - "Community 38"
Cohesion: 0.25
Nodes (7): 1. 標題列按鍵（票 24／27）, 2. tool 次數（票 25）, 3. session 隔離（票 26）, 4. 寬度重跑（`OUT=/tmp/tt28-width scripts/量寬度.sh tt28b`）, 5. hook 錯誤, v0.2b 真機實測（票 28；2026-09-18；claude 2.1.274；tmux 150×40；`--plugin-dir plugins/telltale --debug-file /tmp/tt28.log`）, 沒驗到

### Community 39 - "Community 39"
Cohesion: 0.43
Nodes (7): _notes(), 票 01：plugin 骨架通過 `claude plugin validate --strict`，且 calls 只在白名單內。 評測法：exact…, test_calls_只在白名單內且非空(), test_hooks_註冊了AbovePrompt_的ui_render(), test_validate_strict_exit0(), test_不hook_tool_call_也不hook_classic(), _validate()

### Community 40 - "Community 40"
Cohesion: 0.29
Nodes (6): 16-band-cells（手動）：Pane／AbovePrompt 雙路、幀時鐘、cell 點擊、真機三個未知數, `hooks/band.tsx`, `hooks/register.tsx`, 真機要驗（DESIGN §6，逐項照抄 + 本票的做法）, 突變, 題目

### Community 41 - "Community 41"
Cohesion: 0.29
Nodes (6): 23-狀態列有事才出現：`updated Ns ago` 拿掉，狀態列只在 dropped／error 時佔一列, band.tsx, layout.ts（純函式）, README, register.tsx, 題目

### Community 42 - "Community 42"
Cohesion: 0.29
Nodes (6): 1. headless 整個不動, 26-session 隔離：headless 整個不動；live 資料按 session 分鍵；tick 成功要清 error, 2. live 資料按 session 分鍵, 3. tick 成功要清 error, README, 題目

### Community 43 - "Community 43"
Cohesion: 0.29
Nodes (6): 2026-09-18 票 23 後重跑（狀態列有事才出現；2.1.274，tmux 34 列）, 2026-09-18 票 28 後重跑（v0.2b：edge 三態，AbovePrompt 在 right／both 讓位；2.1.274，tmux 34 列）, 2.1.274 重跑（票 18 補）：`量寬度.py` 認得 dock／inline 型態後, 實測：寬度 200 → 15（票 08，DoD #4）, 票 06 的手動實測（同一個 session，DoD #3、I7）, 票 18：v0.2 重跑（2026-09-18，Claude Code 2.1.274，agents 面板開著）

### Community 44 - "Community 44"
Cohesion: 0.38
Nodes (4): panelIds(), clientOf(), propsOf(), render()

### Community 45 - "Community 45"
Cohesion: 0.29
Nodes (5): ALLOWED, ALLOWED_V02, boot(), demoRegister, Opts

### Community 46 - "Community 46"
Cohesion: 0.33
Nodes (3): 票 09：plugin README 的 validate 區塊與當前輸出一字不差；LICENSE 是 MIT；CI 跑 bun 與 validate。…, test_readme_的validate區塊與當前輸出一致(), _validate_notes()

### Community 47 - "Community 47"
Cohesion: 0.33
Nodes (5): Before exploring, read these, Domain Docs, File structure, Flag ADR conflicts, Use the glossary's vocabulary

### Community 48 - "Community 48"
Cohesion: 0.33
Nodes (5): Conventions, Issue tracker: Local Markdown（docs/tasks/）, Wayfinding operations, When a skill says "fetch the relevant ticket", When a skill says "publish to the issue tracker"

### Community 49 - "Community 49"
Cohesion: 0.33
Nodes (5): 2026-09-17 本機實測（2.1.274）, 其他參考（風格）, 參考：Claude Mods 的 Pane 會依寬度換位置（oikon48，2026-09）, 看到的事, 跟 telltale 的關係

### Community 50 - "Community 50"
Cohesion: 0.33
Nodes (5): 1. Remotion 是什麼, 2. 試衣間.html 能不能直接重用, 3. 替代方案：真終端錄影, 4. README 建議與最小可行流程, README 展示影片／GIF：remotion vs 終端錄影工具

### Community 51 - "Community 51"
Cohesion: 0.33
Nodes (3): agents, STALE_SESSION_MS, reg

### Community 52 - "Community 52"
Cohesion: 0.40
Nodes (4): 01-骨架：plugin 載得起來、validate --strict 過、帶子上畫一行字, 做這張票的順序, 出題者的手動實測（merge 後由主 agent 做，不在跑票流程裡）, 題目

### Community 53 - "Community 53"
Cohesion: 0.40
Nodes (4): 18-發佈 v0.2：README 更新、寬度腳本重跑、CI 綠, 已知落差（回報）, 題目, 驗收測試骨架的斷言範圍

### Community 54 - "Community 54"
Cohesion: 0.40
Nodes (4): 19-plugin-test 評估（手動）：`claude plugin test` 能不能取代 bun harness, `docs/實測/plugin-test.md` 固定格式, 已知落差（回報）, 題目

### Community 55 - "Community 55"
Cohesion: 0.40
Nodes (4): 27-換邊三態：`edge.agents ∈ right|bottom|both` 真的 open／close Pane；標題列多 `[R B RB]`, README, 語意（`edge.agents`，沒存視同 `right`）, 題目

### Community 56 - "Community 56"
Cohesion: 0.50
Nodes (3): AGENTS.md：兩個角色的規矩（codex、agy、Claude subagent 都讀這份；一份知識）, 實作者, 審查者

### Community 57 - "Community 57"
Cohesion: 0.50
Nodes (3): 00-範本：＿＿＿（複製後改成 NN-<slug>.md）, 做這張票的順序, 題目

### Community 58 - "Community 58"
Cohesion: 0.50
Nodes (3): 06-band：Client 畫帶子、點面板標題切換（hit.ts 純函式）, 出題者的手動實測（merge 後由主 agent 做；I7 與 DoD #3 只認這個）, 題目

## Knowledge Gaps
- **323 isolated node(s):** `$schema`, `name`, `description`, `name`, `plugins` (+318 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 489 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **24 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Cell` connect `Community 10` to `Community 0`, `Community 33`, `Community 3`, `Community 5`, `Community 6`, `Community 12`, `Community 13`, `Community 51`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **Why does `displayWidth()` connect `Community 23` to `Community 3`, `Community 6`, `Community 11`, `Community 12`, `Community 13`, `Community 45`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **Why does `renderCell()` connect `Community 11` to `Community 0`, `Community 3`, `Community 6`, `Community 10`, `Community 13`, `Community 23`?**
  _High betweenness centrality (0.002) - this node is a cross-community bridge._
- **What connects `$schema`, `name`, `description` to the rest of the system?**
  _323 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.051791629027401385 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.08489795918367347 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.11295681063122924 - nodes in this community are weakly interconnected._