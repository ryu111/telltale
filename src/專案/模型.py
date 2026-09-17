"""模型介面與假模型：流程層測試不開真模型，用固定腳本跑控制流。"""

from dataclasses import dataclass, field
from typing import Protocol


@dataclass(frozen=True)
class 工具呼叫:
    名稱: str
    參數: dict[str, object] = field(default_factory=dict)


@dataclass(frozen=True)
class 回應:
    文字: str = ""
    工具呼叫: tuple[工具呼叫, ...] = ()


class 模型(Protocol):
    """只要形狀對就能替換：真模型與假模型都符合。"""

    def 推論(self, 訊息: list[str]) -> 回應: ...


class 假模型:
    """吃預先寫好的回應序列。

    腳本用完還被叫，代表迴圈沒照預期停下來——這裡直接爆，
    不要回空字串讓測試綠得莫名其妙。
    """

    def __init__(self, 腳本: list[回應]) -> None:
        self._腳本 = list(腳本)
        self.收到的訊息: list[list[str]] = []

    def 推論(self, 訊息: list[str]) -> 回應:
        self.收到的訊息.append(list(訊息))
        if not self._腳本:
            msg = "假模型的腳本用完了：迴圈多叫了一次"
            raise RuntimeError(msg)
        return self._腳本.pop(0)
