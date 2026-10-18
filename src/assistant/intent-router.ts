import {newWorkbook,importRows,parseCSV,type Workbook} from "../workspace/sheets-model.ts";

/** Model-independent operations. Return a preview, never silently mutate existing files. */
export type SheetIntent={kind:"sheet";name:string;workbook:Workbook;message:string};
export type AppIntent={kind:"open";section:"sheets"|"files"|"settings"|"builder";message:string}
 |{kind:"project";project:string;action:"open"|"query"|"add";message:string}
 |{kind:"memory-save";content:string;message:string}
 |{kind:"memory-search";query:string;message:string}
 |{kind:"memory-delete";query:string;message:string}
 |{kind:"search";query:string;message:string}
 |{kind:"integration";name:string;idea:string;message:string}
 |SheetIntent;
const templates=[
 {regex:/記帳|收支|家庭預算|開支|收入支出|支出表/,name:"家庭收支",rows:[["日期","項目","分類","收入","支出","結餘"],["","","", "", "", "=SUM(D2:D30)-SUM(E2:E30)"]]},
 {regex:/運動|跑步|健身|體適能|重訓|訓練/,name:"運動紀錄",rows:[["日期","運動類型","距離（km）","時間（分鐘）","平均心率","備註"]]},
 {regex:/旅遊|旅行|行程|景點|住宿/,name:"旅行行程",rows:[["日期","時間","地點／活動","交通","費用","備註"]]},
 {regex:/考試|讀書|複習|國考|學習/,name:"讀書進度",rows:[["日期","科目","章節","讀書分鐘","練習題數","正確率","備註"]]},
 {regex:/健康|體重|體脂|腰圍/,name:"健康追蹤",rows:[["日期","體重（kg）","體脂率","腰圍（cm）","活動","備註"]]},
 {regex:/採購|產品|庫存|報價|詢價/,name:"品項比較",rows:[["料號／產品","類別","數量","單價","小計","備註"],["","","","","=C2*D2",""]]},
 {regex:/比較|優缺點|評比|比較表/,name:"比較表",rows:[["項目","方案 A","方案 B","說明"]]}
] as const;
function makeSheet(name:string,rows:readonly (readonly string[])[]):SheetIntent{
 const book=importRows(newWorkbook(name),rows.map(row=>[...row]));
 return {kind:"sheet",name,workbook:book,message:"已準備「"+name+"」表格草稿（"+rows[0].length+" 欄），可在 Sheets 編輯；尚未上傳雲端。"};
}
export function planAppIntent(prompt:string):AppIntent|null{
 const q=prompt.trim();
 if(!q)return null;
 if(/^(?:開啟|打開|前往|進入|顯示)(?:Vanilla\s*)?(?:Sheets|表格)(?:工作區|編輯器)?[!！。?？\s]*$/i.test(q))return {kind:"open",section:"sheets",message:"正在開啟 Vanilla Sheets"};
 if(/^(?:開啟|打開|前往|進入)(?:Vanilla\s*)?(?:Cloud\s*Files|檔案|雲端檔案)(?:管理)?[!！。?？\s]*$/i.test(q))return {kind:"open",section:"files",message:"正在開啟雲端檔案"};
 if(/^(?:開啟|打開|前往|進入)(?:設定|模型設定|登入設定)[!！。?？\s]*$/.test(q))return {kind:"open",section:"settings",message:"正在開啟設定"};
 if(/^(?:開啟|打開|前往|進入)(?:Self[- ]?Build|自建功能|功能工作室)[!！。?？\s]*$/i.test(q))return {kind:"open",section:"builder",message:"正在開啟自建功能"};
 let m=/^(?:學習|研究|保存|儲存|記錄|讀取)(?:這個|該)?(?:網站|網址|網頁|影片|連結)?\s*[：:]?\s*(https:\/\/\S{4,1800})$/si.exec(q);
 if(m)return {kind:"memory-save",content:m[1].trim(),message:"將網站或影片連結加入個人記憶（能否解析取決於來源的瀏覽器授權）"};
  m=/^(?:記住|請記住|幫我記下|加入(?:永久)?記憶)\s*[：:]?\s*(.{3,2500})$/s.exec(q);
 if(m)return {kind:"memory-save",content:m[1].trim(),message:"準備儲存你的記憶"};
 m=/^(?:忘記|刪除記憶|移除記憶)\s*[：:]?\s*(.{2,180})$/s.exec(q);
 if(m)return {kind:"memory-delete",query:m[1].trim(),message:"準備檢查要刪除的雲端記憶"};
  m=/^(?:回憶|回想|查詢記憶|搜尋記憶|從記憶找)\s*[：:]?\s*(.{2,180})$/s.exec(q);
 if(m)return {kind:"memory-search",query:m[1].trim(),message:"搜尋個人雲端記憶"};
 m=/^(?:搜尋|上網搜尋|網路搜尋|查網站|找資料)\s*[：:]?\s*(.{3,200})$/s.exec(q);
 if(m)return {kind:"search",query:m[1].trim(),message:"準備網頁搜尋"};
 m=/^(?:(?:幫我|請|我要|可以)?\s*)?(?:加入|連結|串接|接上|接入|設定|新增|整合)\s*(Canva|Meta|Facebook|Instagram|Notion|OpenAI|Gemini|DeepSeek|LINE|[A-Za-z][A-Za-z0-9_-]{2,45})\s*(?:的)?\s*(?:API|OAuth|金鑰|服務)(?:[。！!]?)(?:，?([\s\S]{0,200}))?$/i.exec(q);
 if(m)return {kind:"integration",name:m[1],idea:q,message:"建立 "+m[1]+" API 串接工程方案"};
  if(/(?:健人|訓練日誌|Fit Score|FIT SCORE)/i.test(q)){
  const action=/新增|記錄|加入|登記|寫入/.test(q)?"add":/開啟|打開|前往/.test(q)?"open":"query";
  return {kind:"project",project:"fitness",action,message:"已識別健人專案"};
 }
 if(/^(?:打開|開啟|前往|查詢)(?:欣緯科技|欣緯軟體|欣緯生醫|稜角|AI 課程)/.test(q)){
  const name=q.match(/欣緯科技|欣緯軟體|欣緯生醫|稜角|AI 課程/)?.[0]||"";
  return {kind:"project",project:name,action:"open",message:"開啟已串聯的專案"};
 }
 // Only create a workbook when explicitly requested. Questions about tables are not commands.
 if(/(?:建立|新增|製作|做一個|生成|產生|幫我做|幫我建|給我一份).{0,55}(?:表格|工作表|試算表|清單|紀錄表|行程表|預算表)|(?:表格|試算表).{0,20}(?:幫我建立|幫我生成|幫我製作)/.test(q)){
  const csv=q.match(/```(?:csv)?\s*\n([\s\S]{4,10000}?)\n```/i);
  if(csv){const rows=parseCSV(csv[1]).slice(0,200).map(x=>x.slice(0,26));return makeSheet("對話產生的表格",rows);}
  const first=templates.find(x=>x.regex.test(q));
  if(first)return makeSheet(first.name,first.rows);
  const title=q.match(/(?:叫做|名為|名稱是|標題是)[「"『]?([^」"』，。]{2,40})/)?.[1]||"新表格";
  return makeSheet(title,[["項目","內容","數量","備註"]]);
 }
 return null;
}
export const PROJECTS=[
 {id:"fitness",name:"健人 · 運動與 FIT SCORE",repo:"easylearnfromtw/Builder",url:"https://easylearnfromtw.github.io/Builder/",type:"personal-data"},
 {id:"欣緯科技",name:"欣緯科技",repo:"easylearnfromtw/signwelltec",url:"https://github.com/easylearnfromtw/signwelltec",type:"site"},
 {id:"欣緯軟體",name:"欣緯軟體",repo:"easylearnfromtw/Signwellsoft",url:"https://github.com/easylearnfromtw/Signwellsoft",type:"site"},
 {id:"欣緯生醫",name:"欣緯生醫",repo:"easylearnfromtw/signwellbio",url:"https://github.com/easylearnfromtw/signwellbio",type:"site"},
 {id:"稜角",name:"稜角 · 學習平台",repo:"easylearnfromtw/Learneasyly-",url:"https://github.com/easylearnfromtw/Learneasyly-",type:"personal-data"},
 {id:"AI 課程",name:"SIGNWELL AI CLASS",repo:"easylearnfromtw/Aiclass",url:"https://github.com/easylearnfromtw/Aiclass",type:"site"}
] as const;
