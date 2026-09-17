# AGENTS.md：兩個角色的規矩（codex、agy、Claude subagent 都讀這份；一份知識）

## 實作者
拿一張 `docs/tasks/<feature>/NN-<slug>.md` 的票去實作。
- **只讀清單**：票的「可碰檔案」「相關檔案」「驗收測試」三行列的檔案。不要掃 repo、不要 grep 全庫、不要讀清單外的檔案。
- **只改可碰檔案**。`tests/` 是出題者的，一個字都不准動；覺得題目錯，寫在回報的 `stuck` 裡，不繞。
- **先看它紅**：先跑驗收測試（`uv run pytest <驗收測試路徑> -x`）。一開始就綠 → 停，回報 `stuck: "題目沒在測東西"`。
- 紅 → 綠 → 重構，最少的程式碼讓它綠。`make check` 綠才算完。
- 不跑 `make mutate`、不做 code-review，那是驗收站的事。
- 不 commit、不開分支、不動 git：worktree 與 commit 由跑票的人管。
- **最後一則回覆只有一個 JSON 物件**，鍵全 ASCII，每個值都要是這次真的跑出來的（貼不出指令輸出就填 `null`，不准填預期值）：
  ```json
  {"check_exit": 0, "check_last_line": "…", "tests_red_to_green": ["tests/流程/test_x.py::test_y"], "files_changed": ["src/專案/x.py"], "stuck": null}
  ```

## 審查者
以票為 spec，只做 **Spec 軸**：每支驗收測試對到票／SDD 的哪一條定義；哪條定義沒有測試（缺漏）；哪些改動不在票的範圍（超範圍）。
- **不要改任何檔案**。只讀票列的檔案加 `git diff <base>..HEAD` 的內容。
- 不評風格、不評命名、不建議重構；那不是這站的事。
- **最後一則回覆只有一個 JSON 物件**：
  ```json
  {"missing": ["定義 X 沒有測試"], "out_of_scope": ["src/other.py"], "test_to_definition": [{"test": "tests/…::test_a", "definition": "SDD 切片層 #2"}]}
  ```
  `missing` 與 `out_of_scope` 都空才算過。
