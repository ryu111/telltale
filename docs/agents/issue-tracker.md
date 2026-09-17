# Issue tracker: Local Markdown（docs/tasks/）

本 repo 的 spec 與票都是 markdown 檔，**不用 `.scratch/`**。

## Conventions

- spec 只有一份：`docs/SDD.md`
- 一個 feature 一個目錄：`docs/tasks/<feature-slug>/`
- 一票一檔：`docs/tasks/<feature-slug>/<NN>-<slug>.md`，從 `01` 依依賴順序編號（被依賴的在前），不准合併成單一檔
- 每張票的欄位照 `docs/tasks/00-範本.md`
- Triage state 寫在檔頭的 `Status:` 一行
- 討論串 append 在檔尾 `## Comments` 底下

## When a skill says "publish to the issue tracker"

在 `docs/tasks/<feature-slug>/` 底下建檔（目錄不存在就建）。

## When a skill says "fetch the relevant ticket"

讀使用者給的路徑或編號對應的檔。

## Wayfinding operations

- **Map**: `docs/tasks/<effort>/map.md`
- **Child ticket**: `docs/tasks/<effort>/<NN>-<slug>.md`，`Type:` 與 `Status:` 各一行
- **Blocking**: 檔頭 `Blocked by: NN, NN`；列的全部 `resolved` 才算解除
- **Frontier**: 掃 `docs/tasks/<effort>/` 找 open、unblocked、unclaimed 的檔，編號小的先
- **Claim**: 先寫 `Status: claimed` 再動工
- **Resolve**: 在 `## Answer` 下寫答案、`Status: resolved`，再把摘要 append 進 `map.md` 的 Decisions-so-far
