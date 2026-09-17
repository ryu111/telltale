# commit 前的閘。門檻是秒數不是工具名：塞不進 10 秒的往 CI 放。
# 多個 agent 會同時跑這裡：每個 make 最多吃 WORKERS 顆核、nice 讓前景操作優先。各 agent 在自己的 worktree 跑，不共用檔案。
.PHONY: check ticket tickets
WORKERS ?= 4
PY = nice -n 10 uv run

# 兩層：Python 這層只守 scripts/（跑票工具）；plugin 本體的閘（validate --strict、TS 測試）
# 在 plugin.json 與 harness 落地的那兩張票各加一行，不先寫死一個還不存在的目標。
check:
	@find scripts tests -name __pycache__ -type d -prune -exec rm -r {} +   # 快取的鍵不含內容，先清
	$(PY) ruff check --no-cache .
	$(PY) ruff format --check --no-cache .
	$(PY) mypy --no-incremental
	$(PY) pytest -n $(WORKERS) --dist load tests/單元

# 一張已核准的票從派工走到 merge（scripts/跑票.py）：停下來就印 JSON 報告、退出碼 3。
ticket:
	$(PY) python scripts/跑票.py $(T)

# 一個 feature 的票全部跑完（scripts/跑全部票.py）：依編號與依賴順序，stopped 的記下、依賴它的跳過。長跑用。
tickets:
	$(PY) python scripts/跑全部票.py $(F)
