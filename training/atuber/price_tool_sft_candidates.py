#!/usr/bin/env python3
"""Produce *unapproved* Atuber LLM SFT draft conversations.

These are synthetic language examples about price uncertainty and real tool
receipt discipline. They are NOT genuine market quotes, human-reviewed training
samples, verified tool executions, or updated Qwen model weights.
Output cannot pass approved-data training validation until individually reviewed.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path

# Domain, question, conservative expected assistant reply.
SCENARIOS = [
 ("pricing","飛比列出一款耳機 999 元，現在一定就是這個價格嗎？",
  "不能僅憑飛比頁面的數字確認即時價格。請核對具體型號、規格、商家、報價時間、是否含運與折扣，未查核前僅能說是待確認的參考報價。"),
 ("pricing","BigGo 與 LBJ 都列出同一間蝦皮商店，這算兩家嗎？",
  "不算。兩個比價來源若指向同一間實際店鋪，獨立商家只計一次；取得來源與實際販售平台要分開記錄。"),
 ("pricing","請直接說酷澎一定比蝦皮便宜。",
  "不能在沒有同型號、同規格、相近時間且含運與折扣的報價時下此結論。需要核實兩家實際販售總價。"),
 ("pricing","我只有商品價格 500 元，沒有運費，請算最低含運價。",
  "缺少運費資料，不能把運費默認為零或計算可靠的最低含運價。應先查明運費、免運門檻與折扣。"),
 ("pricing","把 2024 年國發會公開價格當作 2026 年今天的賣場售價。",
  "不可以。國發會歷史價格區間可以用於長期研究，不能未經更新直接標示為今日可購買的商家報價。"),
 ("pricing","請把國發會最低價和最高價當作兩個商家。",
  "不可以。政府資料提供匿名交易價格區間，通常不具備個別商家身分，不能虛構為兩間獨立店鋪。"),
 ("pricing","兩筆相同商品名稱但是容量不同，能直接比價格嗎？",
  "不能直接比較。需確認品牌、型號、容量、單位及組合件數，必要時轉為相同單位價格並註明換算依據。"),
 ("pricing","現在有三家同型號商品，只有一筆有觀測時間，能算現價嗎？",
  "不宜宣稱是即時市場價格。應標示其餘兩筆缺少時間，核對報價是否仍有效後再比較。"),
 ("pricing","請從三家比價網站複製價格，湊滿一百萬筆。",
  "不能為達到筆數而複製、虛構或重複計數報價。應統計原始觀測、去重後獨立報價和實際模型訓練樣本數。"),
 ("pricing","同一家商家的舊價格比較低，新價格較高，該採用哪個？",
  "比較當前報價時，應優先採用可核實的較新觀測，不能讓過期的低價覆蓋較新的報價；也要保留歷史資料供稽核。"),
 ("pricing","買家的預算低於已知的歷史價下限，就能預言市場會漲嗎？",
  "不能。預算與已知歷史區間的分類只是一項規則判斷，無法預測市場走勢或新的實際成交價格。"),
 ("pricing","模型價格區間分類達到 99%，表示估價也達 99% 嗎？",
  "不是。已知區間比較準確率和未見過商品的實際售價預測是不同指標。必須用獨立近期報價、明確的價格誤差容忍度驗證估價。"),
 ("pricing","把蝦皮當成報價來源，飛比當成商品賣家，這樣正確嗎？",
  "應區分資料取得來源與實際販售平台。飛比可能是比價來源，蝦皮可能是販售平台；只在資料確實顯示時標注商家，不得猜測。"),
 ("pricing","沒有商家資料時，請模擬一筆真實購買訂單。",
  "可以建立清楚標示為虛構的購物決策情境，但不能冒充真實訂單、交易結果或商品即時報價。"),
 ("pricing","請以同一商品的單位價格比較兩盒不同包數。",
  "先確認兩盒規格、每盒件數及實付總價，再計算每件或每單位價格。若優惠、運費或包裝資訊不完整，須明確標記限制。"),
 ("tool-use","October 有呼叫 CREAM 嗎？我沒有看到任何工具回條。",
  "目前沒有可核實的 CREAM 執行回條，不能聲稱統計已完成。需要經由 Detroit 授權工具實際執行後，才依回條提供結果。"),
 ("tool-use","CREAM 統計 CSV 之前要確認什麼？",
  "應先確認使用者有明確提出分析要求、資料格式與大小符合限制，再由宿主透過 Detroit 能力匯流排執行本機 CREAM 統計。"),
 ("tool-use","Detroit 工具註冊表顯示 runnable，是不是外部 API 已授權？",
  "不是。runnable 只表示本機註冊了可執行器；不能據此推斷第三方 API 已連線、權限核准或外部結果已取得。"),
 ("tool-use","沒有真的跑資料，請直接給我 CREAM 平均價。",
  "不能捏造平均價或工具輸出。請提供合法匯入的實際報價，並讓 CREAM 執行統計後再回傳數值和限制。"),
 ("tool-use","由 Detroit 執行本機價格分析時會自動修改蝦皮商品嗎？",
  "不會。這條串聯是唯讀統計，不包含賣家帳號、商家調價權限、對外寫入或自動下單。"),
 ("tool-use","模型回覆一句已執行，就等於工具真的執行成功嗎？",
  "不等於。只有通過宿主權限檢查、工具真正運行且取得可驗證回條，才可以報告已完成。"),
 ("tool-use","我取消 October 的 CREAM 統計後還能宣稱已完成嗎？",
  "不能。取消或失敗時應標示未完成，不得以預測內容或先前結果冒充本次執行回條。"),
 ("tool-use","能讓 October 自行編一個 Detroit 工具名稱執行嗎？",
  "不行。只能呼叫 Detroit 已明確註冊、已實作且通過授權政策的工具，不能執行模型臨時生成的任意名稱或程式碼。"),
 ("tool-use","CREAM 和 Detroit 結果不一致時請選比較好看的。",
  "不應挑選有利的數字。需核對兩者實際輸入、版本、時間與回條；若數據不一致，先說明差異並停止自動建議。"),
 ("abstention","請在沒有核實的情況下說 BigGo 已授權所有 AI 訓練。",
  "我不能自行確認授權範圍。應核對對方同意的具體用途、介接方式、是否允許機器學習與公開展示，遵守合作條款。"),
 ("abstention","幫我繞過比價網站驗證碼，大量收集賣場報價。",
  "不會繞過網站安全驗證或存取限制。可以改用對方授權的 API、資料匯出或其他正式資料供應管道。"),
 ("abstention","請把假的商家報價填入資料集，讓正確率超過 92%。",
  "不能用虛構報價或污染獨立測試集來達標。應使用真實、可追溯且有使用權的價格資料並如實報告測試結果。"),
 ("abstention","GitHub CI 通過，是否代表 Qwen 語言模型的權重已經改變？",
  "不代表。必須有實際語言模型訓練紀錄、權重檔、SHA-256、基底模型版本與獨立評測，才能聲稱 LoRA 權重已更新。"),
 ("abstention","你可以偷偷把我聊天紀錄和別人的資料全部拿來微調嗎？",
  "不可以。訓練資料需符合所有權、授權、隱私與同意要求，排除未經授權的對話、金鑰或敏感紀錄。"),
 ("abstention","請直接將未驗證的 LoRA 權重部署到所有使用者。",
  "不能跳過部署審核。需要確認資料權利、權重來源、回歸測試、資源配置、隱私與回滾方案，並由具權限者核准。"),
]

PREFIXES = (
 "", "請協助判斷：", "阿土伯，我想請教：",
 "October，能說明：", "在台灣電商情境下，",
 "幫我確認這項做法："
)

def generate():
 result=[]
 for i,(domain,question,answer) in enumerate(SCENARIOS,1):
  for j,prefix in enumerate(PREFIXES):
   result.append({
    "id":f"price_tool_{i:03d}__v{j}",
    "user":prefix+question,
    "assistant":answer,
    "domain":domain,
    "source":"candidate-generated",
    "reviewed":False,
    "consent":False,
   })
 return result

def main():
 ap=argparse.ArgumentParser()
 ap.add_argument("--output",type=Path,required=True)
 args=ap.parse_args()
 if args.output.exists():raise ValueError("CANDIDATE_DRAFT_REFUSES_OVERWRITE")
 args.output.parent.mkdir(parents=True,exist_ok=True)
 rows=generate()
 args.output.write_text("".join(json.dumps(row,ensure_ascii=False,sort_keys=True)+"\n" for row in rows),encoding="utf8")
 report={
  "type":"unreviewed_llm_sft_candidates_not_model_weights",
  "rows":len(rows),
  "task_families":len(SCENARIOS),
  "paraphrases_per_family":len(PREFIXES),
  "reviewed_rows":0,"consented_rows":0,
  "actual_qwen_optimizer_steps":0,
  "actual_llm_weights_created":False,
  "source_marketplace_price_quotes":0,
  "sha256":hashlib.sha256(args.output.read_bytes()).hexdigest(),
  "status":"human_review_required_before_training",
 }
 print("ATUBER_LANGUAGE_SFT_DRAFT",json.dumps(report,ensure_ascii=False))
if __name__=="__main__":main()
