"""不變量層：不管腳本長什麼樣，迴圈要嘛回答、要嘛在上限內爆，絕不多叫模型一次。"""

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from 專案.模型 import 假模型, 回應, 工具呼叫
from 專案.迴圈 import 步數用完, 跑

叫工具 = 回應(工具呼叫=(工具呼叫("空"),))
給答案 = 回應(文字="答")
腳本 = st.lists(st.sampled_from([叫工具, 給答案]), min_size=1, max_size=12)


@given(腳本=腳本, 上限=st.integers(min_value=1, max_value=10))
@settings(max_examples=60, deadline=None, derandomize=True)
def test_模型被叫的次數永遠不超過上限(腳本: list[回應], 上限: int) -> None:
    模型 = 假模型(腳本 + [給答案] * 上限)  # 補足，讓「腳本用完」不會搶先爆

    try:
        跑(模型, {"空": lambda: ""}, "題目", 最多步數=上限)
    except 步數用完:
        assert len(模型.收到的訊息) == 上限
    else:
        assert len(模型.收到的訊息) <= 上限


@given(前綴=st.integers(min_value=0, max_value=5))
@settings(max_examples=20, deadline=None, derandomize=True)
def test_只要腳本裡有答案就一定回那個答案(前綴: int) -> None:
    模型 = 假模型([叫工具] * 前綴 + [回應(文字="唯一答案")])

    assert 跑(模型, {"空": lambda: ""}, "題目", 最多步數=前綴 + 1) == "唯一答案"


def test_上限為零是呼叫端的錯_直接爆() -> None:
    with pytest.raises(步數用完):
        跑(假模型([給答案]), {}, "題目", 最多步數=0)
