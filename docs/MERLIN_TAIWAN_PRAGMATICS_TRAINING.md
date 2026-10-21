# Merlin × 阿土伯：台灣華語語用與情緒線索

## 要達成的行為

Merlin 在原本「辨識任務 → 釐清必要資訊 → 結構化提示」前後，補充三個可稽核的能力：

1. **語意推敲**：分辨禮貌疑問（「方便幫我看一下嗎？」其實是在委託處理）、更正與續做，不把反問只當字面問答。
2. **語境對齊**：在**同一段已提供的對話**中，區分「可以」是對前一則提議的接受、還是無脈絡的口頭禪；「繼續」沒前文時仍應釐清，不私自編造要做的事。Victoria 的跨對話記憶須另經許可。
3. **情緒線索推測**：只從**使用者自己當輪的文字**推測可能的語氣，並保留不確定性；「還好啦」「都可以」「ㄏㄏ」「笑死」可能正面、保留、玩笑、挖苦，要看情境，不能推定心理狀態或個性。

**台灣語境不是刻板印象**：台灣華語、閩南語借詞、客語混用、網路流行語、地域／世代／場合差異都應有真人評審資料；沒有充分證據時應使用一般繁體中文作答。不要因語氣或用詞猜測性別、年齡、政治立場、心理疾病、家庭背景、職業或族群。

## 簡要測試示例

| 當輪訊息 | 前文 | Merlin 預期 |
|---|---|---|
| 「可以」 | 阿土伯問是否繼續整理 | 承接任務，但不等同付款、發布、刪除或資料外傳同意 |
| 「可以」 | 無前文 | 不擅自補出任務 |
| 「還好啦」 | 任意 | 保留曖昧性，不直接判定滿意或不滿意 |
| 「好喔」 | 任意 | 可能禮貌，也可能保留；不做確定的諷刺推論 |
| 「我有點擔心會漏資料」 | 專案討論 | 溫和回答疑慮，提出可驗證檢查，避免空泛安慰 |
| 「這版不行，傻眼」 | 程式修改 | 先修正實際錯誤，簡潔承認現況，不說教 |
| 「笑死，又出錯了」 | 執行失敗 | 笑語與抱怨並存，不只當開玩笑 |
| 「翻譯這句：我超生氣」 | 翻譯需求 | 只處理待翻譯文字，不把引文誤認成使用者心情 |

## 實際接線狀態

- `src/detroit/merlin-taiwan-pragmatics.ts`：本機純程式初步語用線索。**不是神經網路已訓練的台灣情緒分類器**。
- `src/detroit/merlin-optimizer.ts`：所有任務深度追加有限的語境提示。簡單問候仍直接回答；無特殊線索時不增加 token。
- `src/local-ai/LocalChat.tsx`：只使用當次對話的近期訊息作語境訊號；本機小模型語用提示被限長，不添加額外神經網路呼叫、不開新背景工作、不默默上傳資料。
- `training/atuber/taiwan_pragmatics.py`：**另外**建立人工標註的台灣華語情境 SFT 入口。與一般 Qwen3 基底人格提示分開管理，待完成實際訓練才能稱為 learned behavior。

## 真人標註資料格式

每行一則 JSON，保存於受核准機器的 `private/taiwan-pragmatics.jsonl`，不得提交到 GitHub；下例是**格式演示，不是已蒐集或審核的真實訓練資料**：

```json
{"id":"sample_001","context_group":"example01","context":"助理剛問要不要繼續整理範例文章。","user":"可以","assistant":"我會沿用目前文章的主題與格式，繼續整理。","intent":"follow-up","affect_cue":"unmarked","ambiguity":"low","locale":"zh-TW","source":"authored","reviewed":false,"consent":false}
```

必要欄位：
- `id`、`context_group`、`context`、`user`、`assistant`、`intent`、`affect_cue`、`ambiguity`
- `locale=zh-TW`、`source=authored|consented`、`reviewed=true`、`consent=true`。

有效意圖：`request`、`question`、`follow-up`、`revision`、`social`、`unknown`。情緒僅標記**文字線索**：`frustration`、`concern`、`appreciation`、`playfulness`、`ambiguous`、`unmarked`。對有歧義的線索必須用 `ambiguity=high`，不可把人工猜測當作個人實際感受。

### 標註流程

1. 取得撰寫者授權或自行創作教材，排除個資、病歷、Gmail、金鑰、真實未授權私人對話。
2. 至少兩位熟悉台灣語境的人員分開評估情境、意圖、表達語氣與理想答覆；有分歧時明記不確定性，再人工定稿。單靠標點或流行語不得推測性格或心理健康。
3. 在正式訓練前至少 **100 筆真人審核**、**20 個不同情境群組**、**15 筆歧義語句**，涵蓋六種文字線索及六類意圖。最低量僅讓流程啟動，**並不足以證明模型品質**。
4. 同一情境的不同說法歸在相同 `context_group`，避免訓練集與測試集交叉洩漏；獨立保留未被微調看過的盲測資料。
5. 正確答覆通常**不應提到情緒標籤**，而應直接、自然地幫助使用者；越權任務仍需原本的權限檢查。

### 驗證與準備訓練

```sh
python3 training/atuber/taiwan_pragmatics.py --annotations private/taiwan-pragmatics.jsonl
python3 training/atuber/taiwan_pragmatics.py \
  --annotations private/taiwan-pragmatics.jsonl \
  --output private/atuber-taiwan-sft.jsonl
python3 training/atuber/train.py \
  --dataset private/atuber-taiwan-sft.jsonl --validate-only
# 真正訓練必須在使用者授權的 CUDA 節點上另行執行 --train
```

測試：`npm run test:merlin`、`npm run test:atuber-model` 和 `npm run build`。

### 量測上線門檻

以未見過的真人盲測對話評估語意與前文一致率、要求釐清是否恰當、主觀語氣適配、情緒過度自信比率、冒犯率、錯誤工具啟動率與推論延遲；不同語境和人群分層比較但**不推測真實使用者人口特徵**。評估資料及不同審核人員的分歧須如實報告，不可宣稱人工編寫的單元測例等同模型的實際準確率。
