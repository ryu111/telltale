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

檢查（出題者自己對過）：
- 每張票的驗收測試都對到上表的 SDD 條目；I9 由 01 的 `test_不hook_tool_call` 與 05 的 exact-seven 涵蓋。
- 可碰檔案：01／02／03 不交集；04 與 01／03 不交集；06 與 07 不交集（07 動 register.tsx，06 只 import type）。`mutations.json` 多張票都碰——**同批並行時 merge 會衝突**，所以 02／03 同批可能撞：跑全部票會在第二張 merge 時 `make check`（不是 rebase），實際 append 衝突交由 merge 失敗 → stopped 回報，屆時手動 rebase。
- 依賴順序：01→05、02→04→05、03→05、05→06/07、06→08、06+07→09。
- 邊界一句話：見各票「題目」。
- 沒有自動測試守的：`band.tsx` 的繪製（06 手動）、真引擎的不重載（06 手動）、寬度縮放（08 手動）。

批次建議：`make tickets F=docs/tasks/band P=1`（`mutations.json` 共用，先序跑最省事；量到時間再開 P）。
