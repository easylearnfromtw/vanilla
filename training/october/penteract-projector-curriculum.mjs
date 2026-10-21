/** October five-dimensional projector supervision.
 * Curated GPT-authored SYNTHETIC task intents, NOT actual user questions or
 * independently human labeled data. Never use eval rows for gradient updates.
 *
 * Two sets deliberately differ in wording. Shared task-domain concepts are
 * inevitable and cannot be described as truly out-of-distribution examples.
 */
export const EXPERT_IDS=Object.freeze(["finance","research","code","design","writing","numbers"]);
const TRAIN=Object.freeze({
 finance:[
 "試算基金的收益與本金風險","評估股票持倉報酬率","檢查退休金資產配置",
 "公司毛利下降幅度有多大","企業營收與現金流解讀","股息殖利率適合長期持有嗎",
 "租金投資回收期試算","現金週轉天數分析","計算稅後淨利",
 "利息支出增加對財務影響","投資組合的年化收益","預估每月儲蓄存款",
 "衡量銀行貸款利率成本","營運資金短缺原因","估算資產總報酬",
 "企業財報是否健康","財務槓桿放大的風險","本金與複利關係",
 "不動產租賃現金流","資產負債表分析","股市波動與資金配置",
 "分析商品毛利率","投資方案的 NPV","每期償債支出估算"
 ],
 research:[
 "搜尋最新學術期刊資料","幫我找醫學研究的證據","查核引用文獻出版年分",
 "整理法規條文可靠來源","公開新聞內容真偽查證","研究設計的證據品質",
 "哪些官方指引已更新","引用論文是否真的存在","要求可靠書目與出處",
 "驗證網站上的數據來源","比對不同研究結論","核對政府公開政策",
 "這個網路新聞有依據嗎","尋找系統性回顧文獻","整理實證等級",
 "搜尋公認專家共識","科學文獻檢索","法律規定的來源查詢",
 "證實傳言有無官方發布","醫療指引中的建議強度",
 "追蹤最新出版研究","查詢新修正的法條","參考資料是否有原文","來源可信度調查"
 ],
 code:[
 "幫我修復 Python 腳本的錯誤","TypeScript 編譯失敗","JavaScript 程式重構",
 "檢查 GitHub 儲存庫","API 的錯誤碼解析","Git 分支合併衝突",
 "前端 CSS 模組有 bug","改善資料庫查詢 SQL","程式碼 review 與測試",
 "測試 npm 套件相容性","修改 React 元件邏輯","應用程式部署流程",
 "Node.js 伺服器異常","分析錯誤堆疊","軟體依賴版本修正",
 "撰寫 Python 函式","修補認證 middleware","重新設計 REST API",
 "定位 JavaScript 執行錯誤","調整 Docker 建置檔",
 "檢查測試案例失敗","管理 GitHub Actions","前端程式資源載入失敗",
 "請撰寫網頁互動腳本"
 ],
 design:[
 "優化網站 UI 的排版","調整 iOS 風格介面","顏色搭配與視覺層次",
 "改善按鈕的 UX 使用體驗","設計品牌形象視覺","產品頁面的留白",
 "繪製資訊圖像","設計海報版面","Figma 設計稿回饋",
 "降低視覺雜訊","改善手機版介面","字體與字級規範",
 "重新整理設計系統","調整網頁元素間距","產品的配色方案",
 "圖示造型與視覺階層","建立優雅的卡片版面","設計網站首頁",
 "改良操作互動體驗","視覺識別標準","制定 UI 元件風格",
 "畫面設計太擁擠","調整閱讀介面","品牌海報色彩建議"
 ],
 writing:[
 "協助撰寫正式文章","將段落改寫得自然","整理報告的敘述段落",
 "起草電子郵件邀請信","寫出清楚的講稿","改進活動文案",
 "編修文件語氣","故事大綱創作","摘要文章的核心內容",
 "幫我潤稿","撰寫公開聲明","準備演講逐字稿",
 "改寫產品介紹文","校對錯別字","設計郵件標題",
 "將訪談整理成文章","撰寫會議記錄","文件內容的語氣調整",
 "精簡長篇敘述","寫一篇社群貼文","創作故事結尾",
 "編輯出版稿件","撰寫履歷自傳","翻譯並潤飾文案"
 ],
 numbers:[
 "CSV 資料平均與標準差","求這組數據的中位數","計算樣本變異數",
 "統計遺漏值的數量","試算表儲存格加總","計算百分比差距",
 "繪製時間序列圖表","用數據計算加權平均","數值分布的四分位數",
 "對表格進行去重統計","資料集欄位的最大值","確認數據是否有離群值",
 "CSV 格式驗證","求累積頻數與比例","以公式算出樣本數",
 "處理表格中空白項目","定量分析的回歸係數",
 "資料清理後計算標準差","資料點的移動平均","試算表公式報錯",
 "畫出箱型統計圖","表格數據分析","求樣本的幾何平均",
 "根據 CSV 產生數值摘要"
 ]
});
const EVAL=Object.freeze({
 finance:[
 "把房貸餘額與還款期數轉成每年負擔","比較兩種 ETF 持有成本","以資產配置衡量通貨膨脹風險",
 "店家獲利率長期趨勢","估算購置設備的現值","借貸和現金部位是否需要再平衡",
 "可支配收入與年儲蓄額","交易手續費吃掉多少盈利"
 ],
 research:[
 "確認這個臨床說法是否有原始試驗支持","我需要可追溯的政府法源",
 "哪些期刊文章能支撐結論","請逐項核實報導引述",
 "這份指南的發布機構是誰","找到原始學術資料庫記載",
 "給我發表年份與 DOI 佐證","分析研究結果是否被誤引"
 ],
 code:[
 "替這個模組排除例外狀況","編譯器警告應該怎麼處理",
 "如何讓這個後端端點回傳正確狀態碼","抓出單元測試失敗的根因",
 "這份套件鎖定檔是否衝突","定位非同步函式的競態條件",
 "修補前端元件中的型別衝突","重新整理服務端路由"
 ],
 design:[
 "幫這個 App 畫面重新建立資訊層級","為行動裝置規劃一致的導覽元素",
 "如何改善觸控目標可用性","這張卡片的陰影與留白怎麼調",
 "制定品牌色彩與輔助色","做一個清爽的儀表板視覺",
 "產品介面的無障礙對比","規劃首頁版面的視覺重心"
 ],
 writing:[
 "把這段冗長描述濃縮成公告","替採訪內容整理一篇導讀",
 "為長篇說明編寫簡潔摘要","起草正式致謝函",
 "替發表會寫主持詞","改寫通知內容讓讀者理解",
 "將會議發言整理成紀錄","撰寫客戶服務回覆的措辭"
 ],
 numbers:[
 "把數列轉成累計比例","逐欄統整遺失觀測值",
 "這一串測量值的離散程度","根據每期數值做趨勢折線",
 "求相鄰月份的變化百分點","從樣本中計算第九十百分位",
 "依照分組頻數求總人數","請比對兩張表的數字差異"
 ]
});
const UNKNOWN=Object.freeze([
 "你好","謝謝","可以","我們繼續","我不知道怎麼辦","早安",
 "你聽得懂嗎","好呀","請幫我看一下","說得不錯"
]);
const MULTI=Object.freeze([
 "查研究後再計算病患的 CSV 統計","改寫文件的同時重新設計 UI",
 "分析股票營收並輸出統計圖表","請修復 Python 程式並替介面配色",
 "找法律來源並起草正式報告","對比 ETF 投資收益並查核最新指引",
 "把表格算完再製作視覺海報","修改網站程式碼後寄一封電子郵件",
 "先讀學術資料再做平均數計算","設計投資研究的可視化儀表板"
]);
const rows=(groups,split)=>Object.entries(groups).flatMap(([label,examples])=>
 examples.map((text,i)=>({id:split+"-"+label+"-"+String(i+1).padStart(2,"0"),
  text,expected:label})));
export const PENTERACT_PROJECTOR_TRAIN=Object.freeze(rows(TRAIN,"tr"));
export const PENTERACT_PROJECTOR_EVAL=Object.freeze([
 ...rows(EVAL,"ev"),
 ...UNKNOWN.map((text,i)=>({id:"ev-unknown-"+String(i),text,expected:null})),
 ...MULTI.map((text,i)=>({id:"ev-multi-"+String(i),text,expected:null}))
]);
export function validatePenteractProjectorCurriculum(){
 const norm=x=>x.normalize("NFKC").trim().replace(/\s+/g," ").toLowerCase();
 const seen=new Set();
 const counts={train:0,eval:0,knownEval:0,unknownEval:0};
 for(const [group,data] of [["train",PENTERACT_PROJECTOR_TRAIN],["eval",PENTERACT_PROJECTOR_EVAL]]){
  for(const row of data){
   if(!row||typeof row.text!=="string"||row.text.length<2||row.text.length>240||
      row.expected!==null&&!EXPERT_IDS.includes(row.expected))throw Error("INVALID_CURRICULUM_ROW");
   const key=norm(row.text);
   if(seen.has(key))throw Error("TRAIN_EVAL_PROMPT_LEAKAGE");
   seen.add(key);
   counts[group]++;
   if(group==="eval"){if(row.expected===null)counts.unknownEval++;else counts.knownEval++;}
  }
 }
 if(counts.train!==144||counts.eval!==68||counts.knownEval!==48||counts.unknownEval!==20)
  throw Error("CURRICULUM_SIZE_CHANGED");
 return {...counts,labels:EXPERT_IDS.length,author:"GPT-authored synthetic",expertReviewed:false};
}
