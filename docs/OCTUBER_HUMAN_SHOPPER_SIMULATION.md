# OCTUBER 模擬真人購物價格感訓練

目的：把實際可核實的**台灣商品價錢**與合成的「真人購物決策」分開，讓 October 模擬真實消費者如何比較價格、辨識規格、詢問運費、查核商家與評估預算。**不假扮真人繞過 Captcha／登入／網站反機器人措施，也不自動下單。**

## 三個來源的用途與呈現

- [BigGo](https://biggo.com.tw/)、[飛比](https://feebee.com.tw/)、[比價撿便宜 LBJ](https://www.lbj.tw/BJ/Default.aspx) 是**資料取得／比價管道**，不表示它們是商品的實際販售者。
- 商品列表只呈現已驗證的販售平台與實際店鋪，例如「蝦皮購物 · XX 商家」或「酷澎 · 自營店」。
- 用戶表示透過私訊已獲三家公司同意；程式在取得正式資料時仍需核對可使用的技術管道、授權範圍與必要歸屬條款。不能僅根據網站上看得到的價格推測機器學習權利。
- 來源名稱、查核時間、證據網址保留在內部訓練資料與稽核報告，不強制逐筆列在商品價格比較 UI。

## 12 種模擬真人角色

careful-bargain-hunter、working-parent、student-budget、busy-professional、reliability-focused、urgent-buyer、high-value-seeker、small-business-owner、quality-first、discount-skeptic、first-time-buyer、comparison-enthusiast。

每個情境的固定步驟：
1. 搜尋商品。
2. 核對型號與容量。
3. 查看來源與價格觀察日期。
4. 比較實際店鋪，合併同店重複列表（不把 BigGo／飛比／LBJ 算作三家獨立賣家）。
5. 確認明確的運費與折扣，未提供者不能假設 0 元。
6. 按**虛構的消費者預算**，提出「可能購買／待查證／不買」的模擬決策，**不是實際訂單**。

程式：`training/atuber/human_shopper_sim.py`。最大可跑 **1,000,000 個合成購物情境**，以彙總和少量樣本保存，不產生假市場價格，也不把這些情境稱為「100 萬個不同商品」。

## 真實資料：國發會官方歷史商品價格區間

[國發會 22933](https://data.gov.tw/dataset/22933)：政府開放資料提供台灣電子發票的價格區間（幣別 TWD），但最後一筆實際觀察日期是 **2024-11-10**。且來源未提供獨立商家與運費，因此可用來練習歷史價位區間，不足以作成 2026 現價結論。

已在 GitHub Actions 使用官方 CSV，完成 **1,000,000 次購物情境**，包含 461 個不同商品名稱。每筆因缺實際賣家均採「尋找可核實店家」，絕不虛構蝦皮／酷澎交易。

真實研究執行：[GitHub Actions 成功紀錄](https://github.com/easylearnfromtw/vanilla/actions/runs/40149626133)。

```bash
python training/atuber/human_shopper_sim.py \
  --input private/ndc-22933-official.csv \
  --mode ndc-official \
  --episodes 1000000 \
  --output artifacts/human-shopper-ndc
```

## 真實授權的多商家報價

`--mode retail-offers` 支援至少下列 CSV 欄位：

`product,sku,merchant,marketplace,source,price,shipping_fee,verified_discount,currency,observed_at,url,training_rights_status`。

- `marketplace` 是 shopee／coupang／momo 等真實平台。
- `source` 為 biggo／feebee／lbj 等實際取得通道，但不對消費者直接展示。
- `merchant` 必須是真實店鋪，`sku` 必須完整，幣別只能 TWD。
- `training_rights_status` 必須是 `authorized`，且執行者要明確使用 `--ack-authorized-feed`。
- 觀察日期需要有時區與 HTTPS 來源網址，只有 48 小時內的報價可供模擬當前選擇；運費缺漏時不可把價格當成總價。
- 完全相同的賣家即使被三個比價網站重複列出，也只算一間商家，至少兩間有確認的商家總價才進行可比較的購物選擇。

```bash
python training/atuber/human_shopper_sim.py \
  --input private/authorized-marketplace-offers.csv \
  --mode retail-offers --ack-authorized-feed \
  --episodes 100000 \
  --output artifacts/human-shopper-licensed-marketplace
```

**這個專案目前尚未連到 BigGo／飛比／LBJ 三個網站的授權 API/CSV，因此以上指令要在持有人提供合法資料後才可用。** 程式沒有遠端登入或網頁自動點擊，沒有繞過網站保護機制。

## 另外進行真正的神經網路更新

`training/atuber/human_shopper_policy_net.py` 以官方真實歷史區間為依據，產生 50,000 組虛構預算，使用 NumPy 手寫反向傳播與 Adam 學習「模擬預算低於／落於／高於歷史區間」。會獨立分出訓練、驗證與**完全未參與訓練／挑選 checkpoint 的商品測試集**，並對照只猜最常見類別的基準。

```bash
python -m pip install numpy
python training/atuber/human_shopper_policy_net.py \
  --input private/ndc-22933-official.csv \
  --output artifacts/human-shopping-range-weights \
  --train-cases 50000 --validation-cases 12000 --steps 1000
```

訓練生成的是**獨立小型神經網路**，不是 Qwen3 主語言模型、不是市場售價預測器，也不代表取得真人成交標籤。不能因為它學會簡單的「歷史區間比較」就宣稱懂 2026 台灣市場或可直接替店家定價。之後仍需**經授權的最新報價與人工審核**，才能將適合的實例製作成 October 真正的 LLM 微調資料。

CI 工作流程：[octuber-human-shopper-prices.yml](../.github/workflows/octuber-human-shopper-prices.yml)；保留小份決策樣本、訓練報告與模型權重，不上傳網站帳號或私人訊息，也不自動發表商品價格。


## 92% 正確率驗收門檻（2026-10-25）

`human_shopper_policy_net.py` 現在有不可向下調低的 **92% 獨立測試分類正確率門檻**。GitHub Action 會在不滿足下列條件時直接標記失敗：未見過商品的保留測試集至少 1,000 題、神經模型正確率 >=92%、且模型表現優於只猜最常見類別的基準。測試資料不能參與訓練或 checkpoint 挑選。完整報告會保留各類別支持樣本與 recall，避免只看單一數字。

已經完成的獨立測試（對 **12,000 次虛構預算與歷史價格區間比較**）：99.525%（超過 92%）；只猜最常見類別約 48.483%。

**更重要的基準：** 因為任務直接提供預算、歷史價格下限和上限，普通的 `if budget < low / budget > high` 三段式規則即可理論上 **100%** 正確。這代表神經模型即使 99.525% 也不是最好的方案，且不能證明 AI 已具有「真實市場估價 92% 準確率」。現在的 92% gate **只適用於窄範圍的歷史價格區間分類**，不能用來批准消費者報價、下單或自動調價。

若要讓真實台灣市場價估計達成有意義的 92%，必須先定義誤差容忍度（例如預測成交價格在實際含運總價 ±10% 以內的比例），並使用近期且有授權的**實際商家 SKU 報價**，保留跨時間、跨商家和未見過商品的獨立測試。沒有數據就不承諾結果。
