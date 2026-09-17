# plugin-test 評估（票 19，2026-09-17）

## 指令
`claude plugin test --help`（先查真實用法，見下「已知落差」）→ `claude plugin test tests/plugin-test/width.test.ts`

## 退出碼
1

## 輸出（前 30 行）
```
$ claude plugin test --help
Usage: claude plugin test [dir]

Runs a function-hooks plugin's tests: every *.test.ts and *.test.tsx under
dir (default: the current folder), each file in a child of this binary, in
an environment like the one its hooks run in. A test file imports its kit
from 'claude-code/testing'. Exits 1 when a test fails.

$ claude plugin test tests/plugin-test/width.test.ts
claude plugin test: /Users/sbu/projects/telltale/.worktrees/band-19-plugin-test評估/tests/plugin-test/width.test.ts: no such plugin folder
(exit 1)

$ claude plugin test tests/plugin-test
claude plugin test: /Users/sbu/projects/telltale/.worktrees/band-19-plugin-test評估/tests/plugin-test: no hooks module to load; there is no hooks/hooks.json naming one in "modules"
(exit 1)
```

## 結論
**不能**：`claude plugin test [dir]` 只接受一個真的 plugin 資料夾（`dir` 底下要有 `hooks/hooks.json`），只掃它自己樹下的 `*.test.ts`；`tests/plugin-test/` 不在 `plugins/telltale/` 樹下，第一關「這是不是 plugin 資料夾」就擋下來，kit 本身能不能用另計（見已知落差 3）。

## 已知落差（相對 SDD §0.1 與本票假設的落差，實測後回報）

1. **`test` 子指令不在 `claude plugin --help` 的 Commands 列表裡**（隱藏指令，`grep -i test` 在主 help 輸出裡找不到 `test` 這行），要直接打 `claude plugin test --help` 才看得到用法。SDD §0.1「2.1.274 實測存在」這句沒錯，但沒提「隱藏」這件事。
2. **不接受單一檔案路徑**：`claude plugin test <file>.test.ts` 直接報 `no such plugin folder`，跟 bun 的 `bun test <path>`（單檔／目錄都吃）行為不同，SDD 與票的假設「像 bun 一樣可以指到一個檔案」不成立。
3. **不接受任意目錄**：即使指到存在的目錄，若該目錄不是 plugin 根（沒有 `hooks/hooks.json`），一樣報錯（`no hooks module to load`）。也就是說它不是一個獨立的「測試檔案發現＋執行」工具，而是「載入某個 plugin，然後在它自己的 hooks 環境裡跑它樹下的 `*.test.ts`」——測試檔要活在被測 plugin 的目錄樹下，不能像 bun 那樣放在旁邊的 `tests/` 平行目錄再指過去跑。**驗證（範圍外實驗，未留在 diff）**：把 `tests/plugin-test/width.test.ts` 臨時複製到 `plugins/telltale/width.test.ts`、跑 `claude plugin test plugins/telltale`，結果 13 pass 0 fail，斷言邏輯與 bun 版本逐條一致（跑完立即刪除該臨時檔，未 commit，git status 確認乾淨）——證實 kit（`describe`／`test`／`expect`）本身可用，卡住的只是「測試檔位置」這個結構性限制。這點使得 SDD §4「取代不存在的 `claude plugin test`」的前提（可以指到 `tests/hooks/`）現在也不成立：就算 v0.3 要遷移，`tests/hooks/` 現在放在 `plugins/telltale/` 外面，不搬進 plugin 目錄本身就用不了。
4. 票的範例檔名 `width.plugin-test.ts` 不會被掃到：glob 是 `*.test.ts`（檔名要以 `.test.ts` 結尾），`width.plugin-test.ts` 結尾是 `-test.ts` 不是 `.test.ts`，不 match；本票交付物已改用 `width.test.ts`（合乎 glob 的最小改動），這件事也一併記在這裡供 v0.3 立票參考。
5. `make check` 目前跑 `bun test tests/hooks/`（`Makefile:16`），不是 `tests/`，新增的 `tests/plugin-test/` 不會被掃到，此處與 00-共同規則已知限制一致，**無落差**。

## 遺留（範圍外，留給 v0.3 立項）

- 若要決定 v0.3 是否把 `tests/hooks/` 整批遷移到 `claude plugin test`，前提是先決定「測試檔搬進 `plugins/telltale/` 樹下」這個結構性改動要不要做；這不在本票範圍，留給 v0.3 立項時再開票（票裡「已知落差」段已預告過這件事）。
