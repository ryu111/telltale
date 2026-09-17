"""最小的 code[llm[tool]] 迴圈：有停止條件、有步數上限。"""

from collections.abc import Callable

from 專案.模型 import 模型

工具表 = dict[str, Callable[..., str]]


class 步數用完(RuntimeError):
    def __init__(self, 上限: int) -> None:
        super().__init__(f"跑了 {上限} 步還沒停")


def 跑(模型物件: 模型, 工具: 工具表, 題目: str, *, 最多步數: int = 8) -> str:
    """模型不再呼叫工具就是停止條件；超過步數上限就爆，不准無限跑。"""
    訊息 = [題目]
    for _ in range(最多步數):
        回 = 模型物件.推論(訊息)
        if not 回.工具呼叫:
            return 回.文字
        訊息.extend(工具[呼叫.名稱](**呼叫.參數) for 呼叫 in 回.工具呼叫)
    raise 步數用完(最多步數)
