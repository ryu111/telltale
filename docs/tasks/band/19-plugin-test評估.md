# 19-plugin-test 評估（手動）：`claude plugin test` 能不能取代 bun harness

- 對應 SDD 節次：§0.1（`claude plugin test` 2.1.274 實測存在）、§4（「取代不存在的 `claude plugin test`」——本票驗這件事現在是不是還成立）
- 可碰檔案：`docs/實測/plugin-test.md`、`tests/plugin-test/`（新目錄，只放這次試搬的一個檔案，不影響 `tests/hooks/`）
- 相關檔案：
  - `docs/SDD.md`（§0.1 最後一條、§4）
  - `.claude/types/claude-code.d.ts`：`declare module 'claude-code/testing'`（9848 行起，讀 60 行：`describe`／`Engine`／`EngineCall`／`Matchers`／`AsyncMatchers` 等——這是這次要試接的 API 全貌）
  - `hooks/width.test.ts`（既有 bun 測試，本票要照它的斷言邏輯、換成 `claude-code/testing` 的寫法搬一份）
  - `docs/tasks/band/00-共同規則.md`
- 驗收：本票**手動**，交付物固定是 `docs/實測/plugin-test.md`，格式見下；缺任一項票不過
- 完成條件：`docs/實測/plugin-test.md` 四項齊全（指令、退出碼、輸出前 30 行、結論）；`make check` 不因為新目錄而變紅（`tests/plugin-test/` 若被既有 bun glob 掃到要確認不會干擾，見下）
- 依賴（Blocked by）：無
- 並行度：可與任何票同時跑（不碰 plugin 程式碼）

## 題目

1. 在 `tests/plugin-test/` 建一個檔案（例如 `width.plugin-test.ts`），把 `tests/hooks/width.test.ts` 的斷言邏輯（照它現有的每一條 case，不要精簡）改寫成 `claude-code/testing` 的 `describe`／`test`／`expect` 寫法，直接 `import { displayWidth, fit } from "../../plugins/telltale/hooks/width"`（`width.ts` 是純函式，不需要引擎，這正是挑一個最簡單的檔案先試的理由）。
2. 執行 `claude plugin test tests/plugin-test/width.plugin-test.ts`（實際旗標與子指令形式以 `claude plugin test --help` 當下輸出為準，不要照抄 SDD 裡舊的猜測——先跑 `--help` 記下真實用法，再跑測試）。記錄：
   - 指令全文（含所有旗標）。
   - 退出碼。
   - 輸出前 30 行（`stdout` 開頭，含失敗訊息就原樣貼，不要摘要）。
   - 結論：**能**（新檔能跑、斷言邏輯與 bun 版本行為一致、可以考慮 v0.3 遷移）或**不能**（含具體原因：子指令不存在、模組解析失敗、純函式測試也要引擎導致無法脫離 `$`、或任何擋住的錯誤），二選一，不寫「應該可以」這種模糊結論。
3. 確認 `make check` 目前跑 `bun test tests/hooks/`（不是 `tests/`），所以新開的 `tests/plugin-test/` 不會被既有的 `bun test` 掃到、也不會被算進「空目錄退出碼 1」那條坑（00-共同規則已知限制）；如果 `Makefile` 的 glob 寫法其實是 `tests/` 而不是 `tests/hooks/`，導致新目錄被 bun 誤掃到、报表混在一起，回報並在 `docs/實測/plugin-test.md` 記一筆，不要為了讓 `make check` 綠而更動 `Makefile`（那是題目要求的範圍外變更，超出本票可碰檔案）。

## `docs/實測/plugin-test.md` 固定格式

```markdown
# plugin-test 評估（票 19，2026-09-17）

## 指令
`claude plugin test tests/plugin-test/width.plugin-test.ts`（實際旗標見上）

## 退出碼
<數字>

## 輸出（前 30 行）
```
<原樣貼>
```

## 結論
**能** / **不能**：<一句話原因>
```

## 已知落差（回報）

- SDD §0.1 對 `claude plugin test` 的描述只到「存在了；kit：`describe`／`test`／`expect`、Engine `$`」，沒有實測過的子指令旗標與檔案發現規則（吃 glob 還是要求單一路徑、能不能像 bun 一樣一次跑整個目錄）；本票只試一個檔案，若要決定 v0.3 是否整批遷移，還需要再驗「整個 `tests/hooks/` 目錄搬過去要花多少工」，那不在本票範圍，留給 v0.3 立項時再開票。
