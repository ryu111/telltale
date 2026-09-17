# commit 前的閘。門檻是秒數不是工具名：塞不進 10 秒的往 CI 放。
# 多個 agent 會同時跑這裡：每個 make 最多吃 WORKERS 顆核、nice 讓前景操作優先。各 agent 在自己的 worktree 跑，不共用檔案。
.PHONY: check eval mutate ticket tickets
WORKERS ?= 4
PY = nice -n 10 uv run

check:
	@find src tests -name __pycache__ -type d -prune -exec rm -r {} +   # 快取的鍵不含內容，先清；只掃自己的碼，不掃 .venv
	$(PY) ruff check --no-cache .
	$(PY) ruff format --check --no-cache .
	$(PY) mypy --no-incremental
	$(PY) pytest -n $(WORKERS) --dist load -m "not llm" tests/單元 tests/流程

eval:
	$(PY) pytest -m llm tests/評測

# 測試有沒有在測：分數低於門檻就紅。門檻從量到的基準訂，只准往上調。
# mutants/ 是 mutmut 的快取，鍵不含測試內容：改了測試不清會沿用舊結果，先清。
# 這條吃核最兇：不進票的完成條件，merge 前由主 agent 跑一次。
MUTATION_MIN ?= 90
mutate:
	rm -rf mutants
	$(PY) mutmut run --max-children $(WORKERS)
	$(PY) mutmut export-cicd-stats
	$(PY) python scripts/mutation門檻.py $(MUTATION_MIN)

# 一張已核准的票從派工走到 merge（scripts/跑票.py）：停下來就印 JSON 報告、退出碼 3。
ticket:
	$(PY) python scripts/跑票.py $(T)

# 一個 feature 的票全部跑完（scripts/跑全部票.py）：依編號與依賴順序，stopped 的記下、依賴它的跳過。長跑用。
tickets:
	$(PY) python scripts/跑全部票.py $(F)
