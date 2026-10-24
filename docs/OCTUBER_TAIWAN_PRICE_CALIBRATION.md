# OCTUBER 台灣零售價格感：國發會第一手資料校準

## 來源與授權

- 資料提供者：國家發展委員會（NDC）
- [資料集 22933：10 大類民生商品電子發票價格資訊](https://data.gov.tw/dataset/22933)
- [官方 CSV](https://ws.ndc.gov.tw/001/administrator/10/relfile/0/9862/17300d07-7b9f-4c88-a1ab-0e406342def4.csv)
- 授權：政府資料開放授權條款－第 1 版；使用應標示機關、資料集及授權資訊。
- 官方價格是 **匿名賣場／超商電子發票價格區間**，不是單一商家的商品標價；不包含商家名稱，不能將區間上下限當成兩家不同商家報價。
- 更新頻率標註為「不定期」。每次執行須檢查檔案 SHA256 與資料最後觀察日期；距今超過 14 天視為歷史參考，不宣稱即時價格。

## 独立的模型與資料安全

原有 UCI Online Retail II 的 1,003,206 筆是 **2009–2011 英國 GBP 歷史交易**；不能作為今天台灣 TWD 價格標籤。這次改用**台灣 NDC 原始民生商品 CSV**，做獨立價格校準，而不是直接匯率換算。

`ndc_taiwan_price_train.py` 只接受五欄的 NDC CSV：日期、商品類別、商品名稱、最低價格、最高價格。拒絕無效數值、日期、倒置的價格上下界；相同類別／商品／日期的記錄不得重複列入樣本。依商品名稱分配 train、validation、test，避免同一商品跨分組洩漏。

當有效商品數量不足時只輸出資料查核結果，不會假造資料來完成訓練。若充足，使用 NumPy 小型神經網路對**實際 TWD 價格區間中點**進行反向傳播與 Adam 優化，和類別中位數基準比較；無論勝負，均**不自動部署**或改動商家售價，且不是 Qwen3 0.6B／4B／14B／30B／32B 權重更新。

命令（檔案必須來自已核實且有使用權的來源）：

```bash
python -m pip install numpy
python training/atuber/ndc_taiwan_price_train.py --input private/ndc-22933.csv --output artifacts/octuber-ndc-twd --train-neural --steps 500
python -m unittest discover -s tests -p 'test_octuber_ndc_prices.py' -v
```

注意：單憑上傳的檔案及 CSV 欄名，無法驗證它確實來自 NDC。真正來源證明必須有取得官方網址的下載回條及檔案指紋。GitHub 工作流程會從官方確定網址下載並留下 SHA256。

## 自動更新條件

新建的 GitHub Action：
[octuber-ndc-twd-prices.yml](../.github/workflows/octuber-ndc-twd-prices.yml)。

- 於 PR 執行 **一次性真實下載、校準與測試**。
- **合併到 main 後**，每週一台灣時間上午 10:00 可以透過 GitHub Actions 排程重新檢查官方 CSV；在 Draft PR 尚未合併時並不會啟動每週更新。
- 只產生報告與未正式發布的小型校準權重；不將原始商品檔、購買資料、API 金鑰或商家資訊公開存入 artifact。
- 任何 CI 失敗（403、下載格式異常、欄位變動、來源不可用）必須回報，不可改為抓取第三方網站或虛構台灣行情。

## 三家比價網站的資料授權

BigGo、飛比、LBJ 可以手動查詢，但目前沒有從三站取得可供大量機器學習訓練的合法 API 或授權 CSV。飛比 [BI 服務約款](https://bi.feebee.com.tw/terms) 指出沒有另外的約定時，資料僅限內部使用，並非授權拿去訓練公開的 October AI 模型。因此三站的價格需要經過正式授權的資料供應管道，並要求明確的模型訓練許可；不得自行繞過限制或網站保護。

## 釋出之前

達到下列條件之前維持研究狀態：實際有足夠的不同商品與日期、測試集無商品洩漏、模型在獨立未見商品上優於類別中位數、來源和觀察時間可追溯、NDC 與授權商家資料分開保留，且對台灣售價的推論不造成錯誤宣稱。
