# DESIGN：agents 面板（telltale v0.2）

> 終端沒有字級、陰影、圓角、補間。能用的只有六種手段：粗體、色彩明度階、邊框樣式、字元密度、留白、位置（題目 §7.4）。
> 這份定「長什麼樣」；「怎麼算」在 `docs/SDD.md` §2.6／§1.5。挑毛病與實作都以本檔的表為準。

## 0. 三條硬規則（btop／htop／k9s 查到的，題目 §7.4）

1. **顏色只表達嚴重度**：綠＝正常進行、黃＝要注意（孤兒 lane、超時）、紅＝失敗／被殺、暗＝已結束或次要。同一顏色不承載第二種語義（type、model 不用顏色分）。
2. **留白的成本是整行**：不用空白列分組，用 `─ agents ───` 標題列與 `├─`／`└─` 連接線。
3. **沒有補間、不閃爍**：狀態切換＝瞬時換符號／換色＋**短暫加粗 1 秒**；spinner 是唯一持續動的東西；經過時間每秒跳。

## 1. 符號表（固定，不隨風格變）

| 狀態 | 符號 | 色 | 說明 |
|---|---|---|---|
| running | `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` 輪播 | 綠 | 80 ms 一幀，Client 的 frame clock 跑，hooks module 不參與 |
| completed | `✓` | 暗 | 60 s 後消失 |
| failed | `✗` | 紅 | 留到點掉 |
| killed | `⊘` | 紅 | 留到點掉 |
| pending／queued | `○` | 暗 | 引擎給的其他 status 一律歸這格 |
| 孤兒 lane（背景任務 30 min 沒通知） | `?` | 黃 | 點掉可收 |
| 主迴圈 idle | `·` | 暗 | 上一輪結束後 60 s 內顯示 `idle · last 1m04` |
| 主迴圈階段 | `responding`／`thinking`／`tool-input`／`tool-use` 原字 | 綠 | 來自 `ui.render{Spinner}` 的 `mode` |

時間格式：`12s`、`1m04`、`12m`、`1h02`（4–5 字元，右對齊）。

## 2. 三段高度（點標題列循環：summary → compact → full → summary）

帶子固定 2 列（標題、狀態）＋每個面板 1 列標題；agents 內容列數：

| 段 | 內容列 | 長相 |
|---|---|---|
| summary | 0 | 只有面板標題列，摘要寫在標題裡：`─ agents · ⠼ 3 running · 1 done · 1 ✗ ─────────────── lanes ─` |
| compact | 3 | 主迴圈 1 列 ＋ 2 列 agent（running 優先；多的折成 `… +N`） |
| full | 吃滿 `maxRows` 剩下的 | 全部列出；不夠時照 SDD §2.6 的聚合／收合規則 |

`full` 在 34 列終端＝6 列內容（9 − 2 − 1）；終端越高越多，上限跟著 `maxRows`。

## 3. 兩種主視圖（`/telltale agents view lanes|tree`，標題列最右的 `lanes`／`tree` 字樣點了也切）

### 3.1 lanes（時序泳道）：橫軸是最近 60 秒，「現在」固定在右緣，每秒整張左移一格

```
telltale · 1 panel                                                                                                 [-]
─ agents · ⠼ 3 running · 1 done ────────────────────────────────────────────────────────────────────────── lanes ─
 main        tool-use   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━▶  1m04
 ⠼ review    sonnet     ·················━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━▶   32s
 ✓ explore   haiku      ··········━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━■······················   18s
 ⠼ impl ×2   sonnet     ····································━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━▶   14s
 ⠼ bg: make check       ···························································━━━━━━━━━━━━━━━━━━━━━━━━━▶    5s
                        └── -60s ───────────────────────── -30s ───────────────────────────────────── now ┘
```

- 欄位：`[符號] [label 10] [model／phase 10] [bar 依 columns 補滿] [elapsed 5]`。label 超長裁 `…`。
- bar：`━` 進行中、`■` 結束點、`·` 視窗內但不在生命期。結束的 lane 在右緣 `■` 之後繼續 `·` 直到 60 s 滑出視窗。
- **bar 長度是真的時間**（視窗固定、現在固定在右緣），所以新 lane 出現不會讓舊 lane 位移——這是題目 §7.1 反對時間軸的理由被解掉的地方：反對的是「軸隨資料伸縮」，這裡軸不伸縮。
- 最後一列刻度只在 `full` 段畫；`compact` 不畫。

### 3.2 tree（流程圖＋樹）

```
telltale · 1 panel                                                                                                 [-]
─ agents · ⠼ 3 running · 1 done ─────────────────────────────────────────────────────────────────────────── tree ─
 main   ● prompt ─▸ ● thinking ─▸ ◉ Bash(make check) ─▸ ○ reply                                                 1m04
 ├─ ⠼ review      sonnet   "spec review of 05"                                                                   32s
 ├─ ✓ explore     haiku    done                                                                                  18s
 ├─ ⠼ impl ×2     sonnet   "implement 06", "implement 07"                                                        14s
 └─ ⠼ bg: shell            make check                                                                             5s
```

- 主迴圈那列是這一輪的流程：固定四個節點 `prompt ▸ thinking ▸ <目前工具> ▸ reply`，目前所在節點 `◉`＋粗體，走過的 `●`，還沒到的 `○`。工具節點顯示 `turn.step` 最後一批 toolUses 的第一個（多個時 `Bash +2`）。
- 子節點縮排一層（`parentId` 有值就再縮一層）。同父、葉節點、type 與 status 都相同的合併成 `type ×N`（題目 §7.1 聚合規則 1）。
- 背景任務（shell／monitor／workflow）標 `bg:` 前綴，掛在 main 底下。

### 3.3 點一列 agent：展開詳情（再點收回）

```
 ├─ ⠼ review      sonnet   "spec review of 05"                                                                   32s
 │     id a1b2c3 · parent main · started 14:02:11 · name reviewer
```

詳情固定 1 列（欄位不夠寬就裁）。同時最多展開 1 列：點另一列時前一列自動收。失敗列點了＝收掉（不展開）。

## 4. 風格三選一（挑毛病前請選；影響 band.tsx 的顏色表與標題列，不影響任何純函式）

### A. 極簡單色（推薦）
只有「綠／紅／暗／一般」四階＋粗體。標題列不加色。上面 §3 的圖就是 A。

### B. btop 式三色明度
running 綠、warning 黃、failed 紅之外，**label 依 type 明度分階**（Explore 淡、general-purpose 一般、自訂 agent 亮），bar 用 `▁▃▅▇` 密度表示每 6 秒的工具呼叫數（活動量），不是單一 `━`。
代價：多一條資料（每 lane 的呼叫數時間序列），bar 的語義從「活著」變「多忙」。

```
 ⠼ review    sonnet     ·················▁▁▃▅▇▇▅▃▁▁▃▃▅▇▇▇▅▃▁▁▁▃▅▅▃▁▁▃▅▇▇▅▃▁▁▃▃▁▁▃▅▇▇▅▃▁▶   32s
```

### C. k9s 式高密度表格
不畫 bar，每列是固定欄位表：`ST  TYPE        MODEL   AGE   TOOLS  DESCRIPTION`，標題列有欄名，running 列整列淡綠底色。
代價：沒有時間感（那是 lanes 存在的理由），但一列塞最多資訊。

```
─ agents · ⠼ 3 running · 1 done ───────────────────────────────────────────────────────────────────────────────────
 ST  TYPE             MODEL   AGE    TOOLS  DESCRIPTION
 ⠼   general-purpose  sonnet  32s    14     spec review of 05
 ✓   Explore          haiku   18s    3      count files
 ⠼   general-purpose  sonnet  14s    9      implement 06  (+1 same)
```

## 5. 這一版明確不做

- hover（click 是唯一互動）。
- 橫向狀態歷史鏈（`● Plan ── ● Code ── ○ Review`）：衍生狀態，第三輪。
- 跨 session 匯總、function hooks 關掉時的降級版（題目 §7.1 第二句），第三輪。
- 顏色自訂／主題。
