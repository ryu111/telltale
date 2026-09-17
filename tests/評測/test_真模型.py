"""評測層：真 LLM、固定案例、看品質分數。`make eval` 才跑，不進 CI。"""

import pytest

pytestmark = pytest.mark.llm


def test_接上真模型後把這支換掉() -> None:
    pytest.skip("還沒接真模型。接上後：固定案例 + 明確通過規則，門檻寫在 SDD 的品質條件")
