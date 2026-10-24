# October：UCI 真實歷史價格百萬筆研究流程

本次整合 **UCI Online Retail II**，官方稱原始資料有 **1,067,371 筆交易行**。來源是 2009-12-01 至 2011-12-09 英國以禮品為主的非實體零售商，其買家有批發商，售價單位是 **GBP（英鎊）**，屬於**舊資料**，**不是台灣 2026 市價**或 BigGo、飛比、LBJ 的資料。

來源、引用與授權：
- Daqing Chen (2012), *Online Retail II*, UCI Machine Learning Repository, DOI: https://doi.org/10.24432/C5CG6D
- 官方頁面：https://archive.ics.uci.edu/dataset/502/online+retail+ii
- 官方 ZIP：https://archive.ics.uci.edu/static/public/502/online%2Bretail%2Bii.zip
- 授權：CC BY 4.0（使用時保留作者、出處、授權與修改聲明）

## 重要：100 萬不是保證合格訓練資料

1,067,371 是**原始**交易筆數。必須排除或標記缺漏價格、取消訂單、退貨、運費、非商品紀錄與同一筆完全重複的來源交易行。不可為湊 100 萬筆而複製資料或編造價格。真正可以投入模型的筆數，以 `ingestion-summary.json` 的 `accepted_valid_unique_price_rows` 和 `partition_rows.train` 為準。

本程式採用 5% 商品 SKU 代碼作為獨立測試、另外 5% 作為驗證；一個 SKU 的交易不會同時在訓練與測試中出現。此一比例是 SKU 分群雜湊選取，不是精確行數比率。資料集沒有完整商品市場分類，程式中的英文關鍵字分類**只是粗略研究特徵，非真實商品類別標籤**。

## 完整合法資料試驗

在你授權的電腦，手動下載 UCI 官方資料後：

```bash
python -m pip install numpy
python3 training/atuber/uci_retail_million.py \
  --dataset private/online_retail_ii.zip \
  --out artifacts/octuber-uci-gbp-history \
  --train-neural
```

此路徑會：
- 以 Python 標準庫逐行串流讀取 XLSX/ZIP 原始檔，避免一次把 100 萬列載入記憶體。
- 產出資料清理統計，包含被拒絕的原因與真實合格行數、不同 SKU 數。
- 僅輸出必要的非個人資訊：SKU、商品名稱、英鎊單價、數量、日期、國別。**不輸出 Customer ID 或 Invoice ID**。
- 使用 numpy 兩層神經網路，在最多 100 萬筆合格訓練資料上執行真正梯度與 Adam 更新，產出小型模型權重 `model-uk-historical-prices.npz`。
- 比較完全未參與訓練的 SKU 測試集上的神經模型與粗略分類中位數模型的 MAE。
- 明確標示 `million_valid_observations_reached` 與 `million_training_rows_reached`，不通過門檻不會謊報達成。

完整訓練模型**不是 Qwen3 4B／14B／30B／32B 的 LoRA**，只是獨立的歷史商品價格數據模型，不能用來直接提供目前台灣的售價與調價。

## GitHub CI 執行

本 PR 新增 `octuber-million-public-prices.yml`：在 PR 變更此計畫時，從 UCI 官方下載 43.5MB ZIP，執行資料解析、清理及 CPU 模型更新，僅上傳無個資的摘要與權重。下載失敗會報錯；不會改抓其他未授權網站或用假資料補齊。

此研究執行不表示 BigGo／飛比／LBJ 已授權、不會自動擷取它們的頁面，也沒有啟動五小時背景付費 GPU。

## 台灣市場下一階段

要讓 October 有**真正台幣價格感**，仍需合法取得最新台灣商品資料：SKU／品牌／型號、規格容量、是否新品、單件價格、運費／稅費／促銷、商家、觀察時間、來源 URL、可供 ML 訓練的授權。資料權利、時間與地理市場不同的報價不可直接混合為同一目標數值。

BigGo：https://biggo.com.tw/；飛比：https://feebee.com.tw/；比價撿便宜：https://www.lbj.tw/BJ/Default.aspx 。三站仍僅為人工查核入口，除非後續取得合法資料供應與訓練權利。
