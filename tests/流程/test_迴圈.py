"""流程層：用假模型驗控制流，一顆真模型都不開。"""

import pytest

from 專案.模型 import 假模型, 回應, 工具呼叫
from 專案.迴圈 import 步數用完, 跑


def test_模型不叫工具就停() -> None:
    模型 = 假模型([回應(文字="答案")])

    assert 跑(模型, {}, "題目") == "答案"


def test_工具結果會餵回下一輪() -> None:
    模型 = 假模型([回應(工具呼叫=(工具呼叫("查", {"鍵": "x"}),)), 回應(文字="好了")])

    結果 = 跑(模型, {"查": lambda 鍵: f"查到 {鍵}"}, "題目")

    assert 結果 == "好了"
    assert 模型.收到的訊息[1] == ["題目", "查到 x"]


def test_超過步數上限會爆_不會無限跑() -> None:
    永遠叫工具 = 回應(工具呼叫=(工具呼叫("空"),))
    模型 = 假模型([永遠叫工具] * 3)

    with pytest.raises(步數用完):
        跑(模型, {"空": lambda: ""}, "題目", 最多步數=3)


def test_預設步數上限是八_爆的時候訊息帶著這個數字() -> None:
    模型 = 假模型([回應(工具呼叫=(工具呼叫("空"),))] * 8)

    with pytest.raises(步數用完) as 例外:
        跑(模型, {"空": lambda: ""}, "題目")

    assert len(模型.收到的訊息) == 8
    assert "8" in str(例外.value)


def test_假模型腳本用完會爆_訊息說明是迴圈多叫了() -> None:
    模型 = 假模型([])

    with pytest.raises(RuntimeError, match="多叫"):
        模型.推論(["題目"])
