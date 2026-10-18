import {validateFeature,type FeatureSpec,type FeatureKind,type FieldType} from "./feature-schema";

type Draft={spec:FeatureSpec;reason:string;confidence:"high"|"medium"|"low";warnings:string[]};
type Field={id:string;label:string;type:FieldType;unit?:string};
function tracker(name:string,description:string,fields:Field[],existing?:FeatureSpec):FeatureSpec{
 return validateFeature({name,description,kind:"tracker",fields},existing);
}
function buildNew(idea:string):Draft{
 const text=idea.trim().slice(0,1800);
 if(text.length<3)throw Error("請再描述你想新增的功能，至少三個字");
 const has=(pattern:RegExp)=>pattern.test(text);
 let spec:FeatureSpec,reason:string,confidence:Draft["confidence"]="medium";
 if(has(/記帳|收支|預算|開支|支出|收入|花費|財務|費用追蹤/)){
  spec=tracker("收支紀錄","記錄收支項目、類別及金額，並匯出 CSV。",[
   {id:"date",label:"日期",type:"date"},{id:"item",label:"項目",type:"text"},
   {id:"category",label:"分類",type:"text"},{id:"income",label:"收入",type:"number",unit:"元"},
   {id:"expense",label:"支出",type:"number",unit:"元"},{id:"note",label:"備註",type:"text"}]);
  reason="偵測到財務紀錄需求，產生收支追蹤器";confidence="high";
 }else if(has(/跑步|運動|健身|訓練|體能|體適能|重訓/)){
  spec=tracker("運動紀錄","記錄訓練內容、時間及基本運動數據。",[
   {id:"date",label:"日期",type:"date"},{id:"activity",label:"運動種類",type:"text"},
   {id:"distance",label:"距離",type:"number",unit:"km"},{id:"minutes",label:"時間",type:"number",unit:"min"},
   {id:"heart_rate",label:"平均心率",type:"number",unit:"bpm"},{id:"note",label:"備註",type:"text"}]);
  reason="偵測到運動追蹤需求，產生運動紀錄器";confidence="high";
 }else if(has(/旅行|行程|景點|導遊|住宿|旅遊/)){
  spec=tracker("旅行行程表","規劃每日行程、地點、交通及預估費用。",[
   {id:"date",label:"日期",type:"date"},{id:"time",label:"時間",type:"text"},
   {id:"place",label:"地點／活動",type:"text"},{id:"transport",label:"交通方式",type:"text"},
   {id:"budget",label:"預算",type:"number",unit:"元"},{id:"note",label:"備註",type:"text"}]);
  reason="偵測到旅行規劃需求，產生旅行追蹤器";confidence="high";
 }else if(has(/國考|讀書|複習|學習|考試|練習|成績|備考/)){
  spec=tracker("學習進度","記錄讀書、複習或考試練習的進度。",[
   {id:"date",label:"日期",type:"date"},{id:"subject",label:"科目",type:"text"},
   {id:"minutes",label:"投入時間",type:"number",unit:"分鐘"},
   {id:"questions",label:"題數",type:"number"},{id:"score",label:"成績",type:"number"},
   {id:"note",label:"備註",type:"text"}]);
  reason="偵測到學習進度需求，產生學習追蹤器";confidence="high";
 }else if(has(/折扣|計算|計算器|換算|估算|單價|總價|公式/)){
  spec=validateFeature({name:"自訂費用計算器",description:"輸入單價、數量及折扣，計算合計金額。",kind:"calculator",
   fields:[{id:"price",label:"單價",type:"number"},{id:"quantity",label:"數量",type:"number"},{id:"discount",label:"折扣率（0–1）",type:"number"}],
   formula:"price*quantity*(1-discount)"});
  reason="偵測到數字運算需求，產生基本計算器（可用 AI 進一步改公式）";confidence="medium";
 }else if(has(/日記|筆記|心得|靈感|隨手記|文章|寫作/)){
  spec=validateFeature({name:"我的筆記",description:"隨手記錄和整理想法，資料留在目前裝置。",kind:"notes",fields:[]});
  reason="偵測到自由文字需求，產生筆記頁面";confidence="high";
 }else if(has(/待辦|購物|清單|打卡|提醒|事項|核對/)){
  spec=validateFeature({name:"我的清單",description:"管理要完成的事項，逐項勾選並匯出 CSV。",kind:"checklist",
   fields:[],initialItems:["第一件待辦事項"]});
  reason="偵測到清單需求，產生待辦清單";confidence="high";
 }else{
  spec=tracker("自訂紀錄器","依需求記錄日期、項目及數值，適合先試用再修改。",[
   {id:"date",label:"日期",type:"date"},{id:"item",label:"項目",type:"text"},
   {id:"value",label:"數值",type:"number"},{id:"note",label:"備註",type:"text"}]);
  reason="需求尚無對應的離線模板，先產生可編輯的通用追蹤器";confidence="low";
 }
 return {spec,reason,confidence,warnings:["這是離線規則建立的功能雛形，未使用雲端 AI 或改寫原始碼；請先檢查欄位與行為。"]};
}
function editExisting(idea:string,current:FeatureSpec):Draft{
 const next={name:current.name,description:current.description,kind:current.kind,
  fields:current.fields.map(x=>({...x})),formula:current.formula,initialItems:current.initialItems};
 const source=idea.trim();
 const match=/(?:新增|增加|加上|加一個|加入)(?:一個)?(?:名為)?[「"]?([\p{Script=Han}A-Za-z0-9_]{1,15})[」"]?(?:的)?(?:欄位|欄)/u.exec(source);
 let reason="保留原功能內容與欄位，建立待你確認的新版草稿";
 let confidence:Draft["confidence"]="low";
 if(match&&(current.kind==="tracker"||current.kind==="calculator")){
  const label=match[1];
  const known=current.fields.map(x=>x.id);
  let id=("field"+(current.fields.length+1));
  while(known.includes(id))id="field"+(Number(id.replace("field",""))+1);
  const fieldType:FieldType=current.kind==="calculator"||/數字|金額|數值|次數|公里|分鐘|分數/.test(label)?"number":/日期/.test(label)?"date":"text";
  if(current.fields.length>=12)throw Error("此功能已有 12 個欄位，達到目前上限");
  next.fields.push({id,label,type:fieldType});
  reason="偵測到新增欄位「"+label+"」，保留既有欄位 ID，避免舊資料消失";
  confidence="medium";
 }else if(/修改|刪除|移除|整合|連接|同步|資料庫|排程|API/.test(source)){
  throw Error("這項改動超出離線規格推導能力，請改用 Ollama／Gemini 生成方案或提交工程需求");
 }
 const validated=validateFeature(next,current);
 return {spec:validated,reason,confidence,warnings:["更新後仍需手動確認。舊紀錄不會自動修改，必要時可回復上一版。"]};
}
export function offlineFeatureDraft(idea:string,current?:FeatureSpec):Draft{
 return current?editExisting(idea,current):buildNew(idea);
}
