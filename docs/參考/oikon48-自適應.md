# 參考：Claude Mods 的 Pane 會依寬度換位置（oikon48，2026-09）

來源：https://x.com/oikon48/status/2100218732090097713（影片本機副本 `oikon48-2100218732090097713.mp4`，不進 git）。
作者用 Claude Code **v2.1.273** 做了一個顯示 Herdr 快捷鍵表的 Mod，用 `/herdr-keys` 開關。

## 看到的事

| 終端寬 | 位置 | 截圖 |
|---|---|---|
| 152 欄 | 右側 dock（整個高度，可捲動，右上角 `×`） | `oikon48-152欄-右側dock.png` |
| 101 欄 | **改成停在輸入框正上方**的方框（約 8 列高，內容截斷） | `oikon48-101欄-底部dock.png` |

拖拉視窗時是引擎自己換位置，Mod 沒有另外畫兩套：同一個 `Pane`，寬就靠右、窄就靠下。

## 跟 telltale 的關係

- 題目 §3.3 說 Pane「<144 欄安靜不畫、寬度只在 `$.ui.open` 當下判定一次」，那是 2.1.267 的實測。2.1.273 已經會自適應：窄時落到 AbovePrompt 的位置。本機 native installer 的 stable 仍是 2.1.267（`claude update` 不會升）。
- 對 agents 面板的意義：右側 dock 給的是**整個終端高度**（34 列終端約 30 列），比 AbovePrompt 的 9 列多三倍；lanes／tree／流程圖在 dock 裡才放得下完整的樹。窄時退回輸入框上方，就是現在的帶子。
- 要不要改走 Pane 是 v0.2 的一個決定，先驗證：`npm i -g @anthropic-ai/claude-code@2.1.273` 另裝一份，用 tmux 150→100 欄看 Pane 真的換位置、debug log 無 refused，再改 SDD。

## 2026-09-17 本機實測（2.1.274）

`scratchpad/panespike`：`$.ui.open({id})`＋`ui.render{Pane}` 畫 12 列。tmux 150×40 → 右側 dock，`bodyColumns=66, viewport=83`；`tmux resize-window -x 100` → 落到輸入框上方的方框，`bodyColumns=96, viewport=100`，只露出約 8 列（其餘被裁）。debug log 無 refused。

## 其他參考（風格）

- `avichawla-trace-spans.png`：trace／span 瀑布，span 隨時間填滿（試衣間風格 G）。
- `de1lymoon-terminal-poster.png`：terminal-poster 風，方框 cell、連線上 ◆ 光點、鏡頭移動（風格 H）。
- `hanako-loops-vs-graphs.png`：每個 job 自己一個 loop（點繞圈）、splitter→jobs→merge、進度條與 stat tile（H 的邊框繞點）。
