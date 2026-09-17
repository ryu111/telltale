# spec-driven-py：新 Python 專案的起手式

```bash
gh repo create <專案名> --template ryu111/spec-driven-py --private --clone
cd <專案名> && uv sync && make check              # 十秒內全綠才算裝好
claude                                            # 然後跑 /開專案
```

## 骨架（工具在讀的名字用 ASCII，裡面的模組與測試用繁體中文）

```
├── pyproject.toml      # 唯一設定來源：專案、相依、pytest、ruff、mypy、mutmut 全在這
├── Makefile            # check（閘，<10 秒，pytest -n WORKERS）／eval（真 LLM）／mutate（有門檻，merge 前跑）。WORKERS 預設 4，多 agent 各在自己 worktree 跑
├── src/專案/            # 要被 import 的東西只住這裡（src layout：測到的是安裝好的那份）
├── tests/
│   ├── 單元/            # 純函式、schema、狀態轉換。無 LLM、無網路
│   ├── 流程/            # loop 的走法：停止條件、重試、錯誤回傳。用 假模型 跑
│   └── 評測/            # 真 LLM 跑固定案例。`pytest -m llm`，不進 CI
├── docs/SDD.md          # 定義本體：穩定層（介面、資料模型、不變量）＋切片層（本輪功能）
├── docs/tasks/          # 一 feature 一目錄，一票一檔（tracker 設定在 docs/agents/）：對應 SDD 節次、可碰檔案、驗收測試路徑、完成條件、依賴
└── .claude/             # 專案級 hook：PreToolUse 範圍（只准動票上的可碰檔案）、PostToolUse 格式與型別
```

## 三個會讓你以為有保證、其實沒有的地方

1. **三種快取的鍵都不含內容**（ruff、mypy、`__pycache__`）：同一秒內改兩次、長度剛好一樣就中。
   所以 `make check` 裡 ruff 帶 `--no-cache`、mypy 帶 `--no-incremental`、跑測試前清 `__pycache__`。拿掉任何一個就會出現「閘綠、CI 紅」。
2. **測試目錄不放 `__init__.py`**，用 `--import-mode=importlib`，它不會去動 `sys.path`。
3. **評測層混進 CI 就是「重做好幾次才過」的根源**：非確定性測試紅了，AI 以為是 bug，越改越歪。

## 停用的那幾組 ruff 規則不要「修好」

`N`、`PLC2401`、`RUF001-003`、`D400/D415/D403` 內建「識別字只能是英文、標點只能是半形」的假設，
跟繁體中文命名衝突。理由寫在 `pyproject.toml` 的註解裡。
