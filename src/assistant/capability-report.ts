/**
 * Vanilla's self-description must be derived from shipped features and runtime
 * connection state, not invented by a small local LLM.
 * No account addresses, credentials, health data or chat history are included.
 */
export type CapabilityTopic="overview"|"models"|"sheets"|"drive"|"memory"|"search"|"media"|"builder"|"fitness"|"research"|"phone"|"travel"|"family"|"report";
export type CapabilitySnapshot={
 localReady:boolean;webgpu:boolean;localModel:string|null;online:boolean;privateMode:boolean;
 driveSession:boolean;geminiConfigured:boolean;deepseekConfigured:boolean;ollamaConfigured:boolean;
};
export type CapabilityStatus="available"|"setup"|"limited"|"planned";
export type CapabilityItem={name:string;status:CapabilityStatus;detail:string;example?:string;};
const LABEL:Record<CapabilityStatus,string>={available:"目前可用",setup:"需要設定／授權",limited:"部分功能",planned:"尚未上線"};
export function capabilityIntent(question:string):CapabilityTopic|null{
 const raw=question.trim();
 const q=raw.replace(/[！!？?。．\s]+$/g,"").replace(/\s+/g,"");
 if(!q||q.length>160)return null;
 // Only answer a self-description query. Do not hijack actual user commands.
 const subject="(?:你|Vanilla|這個(?:AI|助手|系統|App))";
 const ask="(?:做什麼|幫我做什麼|提供什麼|做哪些事|哪些功能|什麼功能|所有功能|全部功能|功能清單|功能列表|功能介紹|能力介紹|有哪些能力|可以做哪些事|可以幫我做什麼)";
 const direct=new RegExp("^"+subject+"(?:現在|目前|實際上|到底|具體|真正)?(?:能|會|可以|有|支援)?"+ask+"$","i");
 const prefixed=new RegExp("^(?:請問|我想知道|想了解|我想問)"+subject+"(?:現在|目前)?(?:能|會|可以|有|支援)?"+ask+"$","i");
 const intro=/^(?:介紹|說明|列出|顯示|查看|告訴我|請介紹|幫我整理)(?:你|Vanilla|你的|目前|現有|所有|全部)?的?(?:功能|能力|功能清單|支援項目|可用功能)$/i;
 const short=/^(?:你的|Vanilla的|你|Vanilla)?(?:功能|能力)(?:介紹|清單|列表)$/i;
 const ability=/^(?:我想知道|想了解)(?:你|Vanilla)(?:能|可以|會)(?:做|幫我做)什麼$/i;
 if(direct.test(q)||prefixed.test(q)||intro.test(q)||short.test(q)||ability.test(q))return "overview";
 if(!new RegExp("^(?:(?:請問|想知道|我想問))?"+subject+"(?:現在|目前)?","i").test(q))return null;
 const asksStatus=/(?:功能|能力|支援|具備|上線|完成了嗎|做好了嗎|可以用了嗎|能用了嗎|做得到嗎|有辦法嗎|可不可以|能不能|能否|是否|嗎|么|呢)$/.test(q)||/[?？]\s*$/.test(raw);
 if(!asksStatus)return null;
 const topics:[CapabilityTopic,RegExp][]=[
  ["phone",/(?:手機|iPhone|Android|Mobilerun|跨App|裝置控制|操作其他App)/i],
  ["research",/(?:CREAM|統計|圖表|資料分析|研究|論文|文獻|回歸|儀表板|dashboard)/i],
  ["family",/(?:家庭成員|家庭帳號|家庭權限|帳號隔離|家人|多人|身分識別|家人的資料)/i],
  ["travel",/(?:旅行|旅遊|導遊|行程規劃|機票|酒店|飯店)/i],
  ["fitness",/(?:健人|FIT SCORE|跑步紀錄|運動紀錄|體適能)/i],
  ["media",/(?:圖片|照片|影片|PDF|DOCX|XLSX|PPTX|OCR|附件|識圖)/i],
  ["drive",/(?:Drive|雲端|檔案|同步|Google|備份)/i],
  ["memory",/(?:記憶|記住|回想|記錄偏好|RAG)/i],
  ["search",/(?:上網|搜尋|網站|查資料|即時資訊|網路)/i],
  ["sheets",/(?:表格|試算表|Sheet|Excel|CSV|儲存格|公式)/i],
  ["builder",/(?:功能開發|新增功能|程式|代碼|自我修改|自行更新|Self.Build|API|整合|串接|GitHub)/i],
  ["report",/(?:報告|匯出|下載|做成PDF|簡報|PowerPoint)/i],
  ["models",/(?:模型|本地AI|離線|WebLLM|Ollama|Gemini|DeepSeek|聊天|回答問題)/i]
 ];
 for(const [topic,pattern] of topics)if(pattern.test(q))return topic;
 return null;
}
export function capabilityItems(s:CapabilitySnapshot):Record<Exclude<CapabilityTopic,"overview">,CapabilityItem>{
 const remote=!s.privateMode&&s.online&&(s.geminiConfigured||s.deepseekConfigured||s.ollamaConfigured);
 const connected=s.driveSession&&!s.privateMode&&s.online;
 return {
  models:{name:"AI 對話與模型",status:s.localReady?"available":"setup",detail:s.localReady?
   "本機模型已載入"+(s.localModel?"（"+s.localModel+"）":"")+"；可在這支裝置生成文字"+(remote?"，也可使用已設定的外部模型。":"。"):
   "目前沒有已載入的可用本地模型"+(!s.webgpu?"（此瀏覽器沒有可用 WebGPU）":"")+"；"+(remote?"已偵測到外部模型設定，但尚未檢查連線與額度。":"請先下載／載入本地模型，或在設定中連接雲端模型／Ollama。"),example:"幫我解釋全人工髖關節置換術"},
  sheets:{name:"Vanilla Sheets",status:"available",detail:"可建立與編輯本機多工作表、套用部分公式、匯入 CSV、匯出 CSV／JSON；聊天可建立表格草稿及提出逐格修改，修改前需確認。不是完整 Excel 或 Google Sheets。",example:"幫我做一份家庭收支表格"},
  drive:{name:"Google Drive 雲端檔案",status:connected?"available":"setup",detail:connected?
   "偵測到 Google Drive 登入工作階段；可透過既有介面讀取、建立、上傳、改名及移至垃圾桶。實際能否成功仍取決於網路、權限與 API。":
   s.privateMode?"目前為私密模式，不能存取個人 Drive；可先切回一般模式。":
   !s.online?"目前裝置離線，Google Drive 操作暫不可用。":"需先使用 Google 登入並授權 Drive，才能存取個人檔案。",example:"開啟雲端檔案"},
  memory:{name:"個人記憶／RAG",status:connected?"available":"setup",detail:connected?
   "已具備在授權 Google Drive 中儲存、搜尋、回憶及確認後刪除記憶索引的流程；不是模型權重訓練，也不保證完整讀取所有網站或影片。":
   "個人長期記憶需要一般模式、有效的 Google Drive 授權及網路；私密對話不自動同步至 Drive。",example:"記住：我偏好繁體中文回答"},
  search:{name:"網站搜尋入口",status:s.online?"limited":"setup",detail:s.online?
   "能實際搜尋 Wikipedia／Crossref 公開索引，並嘗試讀取來源網頁正文交給已啟用的模型依據來源統整。完整跨網域搜尋與受 CORS 限制的網頁，需要設定並部署安全的 HTTPS 搜尋／擷取後端；不能宣稱已查遍所有網站。":
   "目前離線，無法取得最新網站內容；已儲存的連結設定仍可保留。",example:"搜尋：台灣醫師國考"},
  media:{name:"附件與圖片",status:"limited",detail:s.privateMode?
   "可在當次私密對話處理部分文字附件；圖片理解需要相容且已授權的視覺模型，單靠本地文字模型無法識圖，私密模式不傳雲端。PDF、PPTX 和影片不具備完整解析。":
   "可附加圖片及部分文字檔；圖片辨識要有可用的 Gemini 視覺模型且明確同意傳送。PDF／DOCX／PPTX／影片目前不具備完整內容解析，不能只靠上傳就宣稱已讀取。",example:"＋ 附件"},
  builder:{name:"Self-Build 本機工具／GitHub 原始碼改善",status:"limited",detail:"本機可實際安裝、更新與復原宣告式小工具。新增 CODE 模式可使用選定模型產生真正 TypeScript/React 程式修改；必須另行部署並設定受保護 GitHub Worker 才能讀寫 Repository、建立 Draft PR、執行 CI 與最多兩次修正。未配置 Worker 前不能聲稱已連線 GitHub；CI 通過也不會自行合併 main。",example:"自主迭代：改善 NOODLES 模型品質評估"},
  fitness:{name:"健人資料橋接",status:"limited",detail:"在同一瀏覽器有健人資料且獲得確認時，可讀取已儲存的跑步／重訓摘要，並經確認新增符合格式的跑步紀錄；不等於已同步所有裝置或取得別人的健康資料。",example:"查詢健人的跑步數據"},
  research:{name:"CREAM／進階數據分析",status:"limited",detail:"CREAM P0 已正式整合於聊天：貼上 CSV 或上傳 CSV／XLSX 即可在裝置端計算描述統計，產生可互動長條圖、折線圖和散佈圖並匯出 CSV。完整 14 模組中的跨文獻研究、推論統計、PDF 專業報告及全面證據驗證仍待開發，不能聲稱已具備。",example:"CREAM：月份,數值\\n一月,10\\n二月,20"},
  phone:{name:"Mobilerun／手機操作",status:"planned",detail:"Mobilerun 裝置操作仍是待整合功能；iPhone PWA 沒有跨 App 系統控制權，不能直接點擊其他 App、操控設定或自動發送訊息。"},
  travel:{name:"家庭旅行與即時導遊",status:"limited",detail:"可利用已啟用的文字模型提供規劃建議，以及建立旅行表格；尚無完整即時航班／訂房／導遊代理與自動預訂能力。"},
  family:{name:"家庭身分與權限",status:"limited",detail:"目前以不同 Google 帳戶／個人儲存區隔離為主要基礎，完整家庭身分辨識、跨帳戶分享授權及伺服器端 RBAC 尚未完成；不會自動讀取其他人的私有資料。"},
  report:{name:"報告與匯出",status:"limited",detail:"現有文字回答可複製、輸出 Markdown／HTML、符合格式的表格可匯出 CSV，也有瀏覽器列印成 PDF 入口；不等於已實作研究級 PDF／Word／PowerPoint 自動排版引擎。"}
 };
}
export function capabilityAnswer(topic:CapabilityTopic,s:CapabilitySnapshot):string{
 const items=capabilityItems(s);
 if(topic!=="overview"){
  const x=items[topic];
  return "Vanilla 功能實況｜"+x.name+"\n狀態："+LABEL[x.status]+"\n"+x.detail+
   (x.example?"\n你可以試著說：「"+x.example+"」":"")+
   "\n\n以上依這個版本的功能與當下裝置狀態整理；已設定不等於已完成實際連線測試。";
 }
 const ordered:(keyof typeof items)[]=["models","sheets","drive","memory","search","media","builder","fitness","report","travel","family","research","phone"];
 return "我是 Vanilla。以下是這個版本實際具備的功能及此裝置狀態，不會把規劃或開發中的功能當成已完成。\n"+
  ordered.map(key=>{const x=items[key];return "\n• 【"+LABEL[x.status]+"】"+x.name+"："+x.detail;}).join("")+
  "\n\n常用指令範例：\n「幫我做一份家庭收支表格」\n「搜尋：台灣醫師國考」\n「開啟雲端檔案」\n「記住：我偏好簡潔回答」（需授權 Drive）"+
  "\n\n這份清單來自程式內的功能登錄與當下的模型／網路／登入狀態；連線是否真的成功，必須以實際操作結果為準。";
}
