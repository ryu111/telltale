# band：票 → SDD 對照表

| 票 | SDD 條目 | 驗收測試 | 可碰檔案 | Blocked by |
|---|---|---|---|---|
| 01-骨架 | 切片 #1；§0 hooks.json surface；§1.4 | `tests/單元/test_validate.py` | plugin.json、hooks.json、register.tsx、band.tsx、tsconfig.json、Makefile | — |
| 02-寬度 | §1.3；I4 | `hooks/width.test.ts` | width.ts、mutations.json | — |
| 03-版面 | §1.2 七條；I2、I3 | `hooks/layout.test.ts` | layout.ts、mutations.json | — |
| 04-面板 | §1.1、§2.2、§2.2a、§2.3；I6、I10 | `hooks/panels.test.ts` | panel.ts、panels/*、mutations.json | 02 |
| 05-harness與render | §1.4、§1.5、§2.1、§3、§4；I1、I4、I5、I7(fake)、I8、I10、I11 | `hooks/register.test.tsx` | harness.ts、register.tsx、mutations.json | 01、03、04 |
| 06-band | §1.5；I7（tmux） | `hooks/hit.test.ts` ＋ 手動 tmux | band.tsx、hit.ts、mutations.json | 05 |
| 07-command | §1.6；§3 command.run | `hooks/command.test.ts` | command.ts、register.tsx、mutations.json | 05 |
| 手動/08-寬度實測 | 切片 #8；I4、I11；DoD #4 | 腳本＋`docs/實測/寬度.md` | scripts/量寬度.sh | 06 |
| 09-發佈 | 切片 #9；§2.5；題目 §6.3 | `tests/單元/test_readme.py` | README.md、LICENSE、check.yml | 06、07 |
| 10-cells基礎 | 切片 #10；§1.1a；I15 | `tests/hooks/cells.test.ts` | cells.ts | — |
| 11-段位 | 切片 #11；§1.2 規則 8；§1.5 v0.2；§1.6 size | `tests/hooks/stages.test.ts` | layout.ts、hit.ts、register.tsx、command.ts、panel.ts(stages) | — |
| 12-觀察hooks | 切片 #12；§2.6a；I12⊆、I13、I17 | `tests/hooks/observe.test.tsx` | observe.ts、register.tsx、harness.ts | 11 |
| 13-agents面板 | 切片 #13；§2.6、§2.7、§2.1 cells；I16 | `tests/hooks/agents.test.ts` | panels/agents.ts、panels/index.ts、register.tsx、panel.ts、plugin.json | 12 |
| 14-renderCell | 切片 #14；§1.1a renderCell；DESIGN §1–2；I4、I14 | `tests/hooks/cells-render.test.ts` | cells.ts | 10 |
| 15-動態 | 切片 #15；DESIGN §3；I18 | `tests/hooks/cells-dynamics.test.ts` | cells.ts | 14 |
| 16-band-cells | 切片 #16；§1.5 v0.2；DESIGN §4、§6；I12 恰好 | 手動 `docs/實測/agents.md` | band.tsx、register.tsx、hit.ts | 13、15 |
| 17-agents指令與點擊 | 切片 #17；§1.6 v0.2；§2.6 onRow | `tests/hooks/agents-command.test.ts` | command.ts、panels/agents.ts、panel.ts、register.tsx | 13、16 |
| 18-發佈v0.2 | 切片 #18；§2.5 | `tests/單元/test_readme_v02.py`＋寬度腳本 | README×2、docs/實測/寬度.md | 16、17 |
| 19-plugin-test評估 | 切片 #19；§4 | 手動 `docs/實測/plugin-test.md` | tests/plugin-test/ | — |
| 20-desc單行 | §2.6a；DESIGN §1；票 17 實測 | `tests/hooks/observe-desc.test.tsx` | observe.ts | 17 |

v0.2 批次（可碰檔案不交集才同批）：B1 {10, 11, 19} → B2 {12, 14} → B3 {13, 15} → B4 {16} → B5 {17} → B6 {18, 20} → B7 {21} → B8 {22} → B9 {23}。2026-09-18 全部 merged（21 於真機實測後補開，同日 merged）。v0.2b（2026-09-18 真機回饋）：B10 {24, 25} → B11 {26} → B12 {27} → 28（主 agent 真機）。
v0.2 檢查（出題者對過）：12／13／16／17 的路徑已改成 `plugins/telltale/…` 全路徑（範圍 hook 比對整串）；harness 擴充歸 12；`Panel.stages` 由 11 加欄位；`turn.step` 的 toolUses 在 result；`session.receive` matcher 是物件。

檢查（出題者自己對過）：
- 每張票的驗收測試都對到上表的 SDD 條目；I9 由 01 的 `test_不hook_tool_call` 與 05 的 exact-seven 涵蓋。
- 可碰檔案：01／02／03 不交集；04 與 01／03 不交集；06 與 07 不交集（07 動 register.tsx，06 只 import type）。`mutations.json` 多張票都碰——**同批並行時 merge 會衝突**，所以 02／03 同批可能撞：跑全部票會在第二張 merge 時 `make check`（不是 rebase），實際 append 衝突交由 merge 失敗 → stopped 回報，屆時手動 rebase。
- 依賴順序：01→05、02→04→05、03→05、05→06/07、06→08、06+07→09。
- 邊界一句話：見各票「題目」。
- 沒有自動測試守的：`band.tsx` 的繪製（06 手動）、真引擎的不重載（06 手動）、寬度縮放（08 手動）。

批次建議：`make tickets F=docs/tasks/band P=1`（`mutations.json` 共用，先序跑最省事；量到時間再開 P）。
| 21-真機細修 | §2.1、§2.6、§2.6a、§1.2 規則 8；主 agent 真機實測 | `tests/hooks/session-scope.test.tsx` | observe.ts、panels/agents.ts、register.tsx、panel.ts、cells.ts | 20 |
| 22-空stub不留 | §2.6、§2.6a；DESIGN §1；票 21 後真機實測 | `tests/hooks/empty-stub.test.ts` | panels/agents.ts | 21 |
| 23-狀態列有事才出現 | §1.2 規則 1／2／5、§1.5 末列、I3；使用者裁定 | `tests/hooks/status-row.test.tsx`（＋改寫 layout.test.ts、session-scope 一數字） | layout.ts、hit.ts、band.tsx、register.tsx、README | 22 |
| 24-標題列按鍵 | §2.8 按鍵、樣式預設依 placement；§1.6 `style auto`；DESIGN §4／§5 | `tests/hooks/buttons.test.tsx` | hit.ts、band.tsx、register.tsx、command.ts、README | 23 |
| 25-tool次數 | §2.8 tool 次數；DESIGN §1 | `tests/hooks/tool-count.test.ts` | cells.ts | 23 |
| 26-session隔離 | §2.8 session 隔離；§2.1 分鍵；I12（+session.id、store.keys／delete） | `tests/hooks/headless.test.tsx`（＋既有測試改 `agents.cells.<sid>`、validate 白名單、README 貼文） | register.tsx、README | 24、25 |
| 27-換邊三態 | §2.8 換邊三態、`[R B RB]`；§1.6 `edge both`；I12（+ui.close） | `tests/hooks/edge.test.tsx`（＋buttons／agents-command／validate／readme 改版） | register.tsx、command.ts、hit.ts、band.tsx、README | 26 |
| 28-真機實測v02b | §2.8 全部；規則 4b | `docs/實測/v02b.md` | docs 與坑 | 27 |
