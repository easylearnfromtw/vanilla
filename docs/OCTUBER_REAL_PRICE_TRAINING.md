# October：以真實觀察價格進行權重訓練（實驗性價格感模組）

這個流程使用**真實公開價格區間或具訓練授權的報價資料**，以 PyTorch 執行反向傳播與 AdamW optimizer 更新。與既有的 10,000 筆合成商品沙盤不同。訓練的是獨立小型價格校準網路，**不是** Qwen3 0.6B／4B／14B／30B／32B 模型權重。

## 可核實的資料來源

1. 國發會「物價資訊看板」及政府資料開放平台公布的民生商品價格：參考 https://price.ndc.gov.tw/p/zh_tw/necessities 、https://data.gov.tw/dataset/8066 。前者為**民生零售價格區間**；農業部 8066 是**農產品批發交易價（元／公斤）**，不能與一般電商零售價合併成同一訓練標籤。
2. BigGo https://biggo.com.tw/ 、飛比 https://feebee.com.tw/ 、LBJ https://www.lbj.tw/BJ/Default.aspx：保留作為**人工比價入口**。現階段沒有取得它們三者的批次訓練資料授權／10,000 筆真實商品報價。只有權利人授權的 CSV／API 才能輸入，不能用網頁抓取或猜測價格。
3. 一次性公開價格研究快照（2026-10-19）由 https://food.codecity.com.tw/goods 轉載國發會價格，**屬於二次來源**。2026-10-25 的首次本地研究使用 60 筆這種可追溯的公開報價區間；需重新對照官方及資料條款，不能據此宣稱有 60 筆第一手即時零售價或商業模型資料授權。

CSV 欄位範例（價格僅用於描述格式，**不是網站實際報價**）：

```csv
product,category,spec,price_min_twd,price_max_twd,observed_date,source_url,evidence_class,currency,training_rights_status
示意商品A,示意分類,500g,100,140,2026-10-25,https://example.org/quote,licensed-comparison-feed,TWD,authorized
```

使用時必須填寫實際來源 URL、正確來源種類、觀察日期、產品型號、規格及授權狀態。以上示例是說明 schema，不能當成訓練資料。

## 只核對資料，完全不訓練

```bash
python training/atuber/real_price_train.py --validate-only --input private/octuber-prices.csv
```

若輸入是**政府公開資訊的二次轉載，且已核對使用權利，只限研究**，必須另加入 `--research-secondary`；它不會自動把內容升格為第一手行情。

## 真正的 PyTorch 權重更新（小型價格網路）

在明確允許對這批資料進行模型研究的執行環境：

```bash
python -m pip install torch numpy
python training/atuber/real_price_train.py --train --input private/octuber-prices.csv --output artifacts/octuber-price-real-v1 --steps 1500
```

如使用已確認可研究的二次來源，增加 `--research-secondary`。訓練器會分成訓練集、驗證集和未見過的商品測試集，讓**相同商品名稱及其不同容量規格不跨集合**。模型使用商品中文字串、分類及規格；目標是來源報價區間中點，不是憑空產生的價格。測試時和**同類別中位數**的低成本基線比較。輸出完整來源指紋、實際 optimizer 次數、測試 MAE/MAPE、模型 weights 檔。

目前只有 60 項公開生活商品的少量快照，價格模型**未勝過同類別中位數基準**，所以明確不允許用於自動售價建議、商家改價或即時行情引用。必須等到已授權的真實資料（不同品牌、型號、SKU、商家、時間、運費與促銷）足夠，並在留出集和未來時間集都勝過基準後才考慮升級。

## 未來持續校準

新增的**真實且合法取得**資料只能走兩條路：取得三站授權的官方／合作 API 或 CSV，或使用政府有公開授權的價格資料；不能讓虛構商品與合成異常價混入真實價格標籤。每次增加資料必須重新做來源、觀察時間、幣別、型號／規格、商家去重及授權檢查，並保留舊模型、獨立測試和訓練產物以供稽核。

自動重新訓練／更新商品價格需要核准的資料串接及作業排程；**目前還未對 BigGo／飛比／LBJ 啟用任何背景擷取或模型自動部署**。
