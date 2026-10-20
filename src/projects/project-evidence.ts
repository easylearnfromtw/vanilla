/** Project identity and evidence policy. No model is allowed to invent actions or current data. */
export type ProjectEvidenceScope={label:string;repositories:string[];citymus:boolean};
const CITY=/\b(?:CITMUS|CITYMUS|citymusic|musiccity|musictown)\b/i;
const SIGN=/(?:欣緯(?:生醫|科技|軟體)?|sign[\s-]?well(?:bio|tec|soft)?)/i;
const REPOS={
 city:"easylearnfromtw/citymusic",
 bio:"easylearnfromtw/signwellbio",
 tec:"easylearnfromtw/signwelltec",
 soft:"easylearnfromtw/Signwellsoft"
} as const;

/** Resolve both common spelling variants and the exact SignWell subdivision. */
export function projectEvidenceScope(question:string):ProjectEvidenceScope|null{
 const city=CITY.test(question),sign=SIGN.test(question);
 if(!city&&!sign)return null;
 const repositories:string[]=[];
 const names:string[]=[];
 if(city){repositories.push(REPOS.city);names.push("CITYMUS");}
 if(sign){
  const specific=new Set<string>();
  if(/欣緯生醫|sign[\s-]?wellbio/i.test(question))specific.add(REPOS.bio);
  if(/欣緯科技|sign[\s-]?welltec/i.test(question))specific.add(REPOS.tec);
  if(/欣緯軟體|sign[\s-]?wellsoft/i.test(question))specific.add(REPOS.soft);
  repositories.push(...(specific.size?[...specific]:[REPOS.bio,REPOS.tec,REPOS.soft]));
  names.push(specific.size===1?(specific.has(REPOS.bio)?"欣緯生醫":specific.has(REPOS.tec)?"欣緯科技":"欣緯軟體"):"欣緯（多個專案）");
 }
 return {label:names.join("、"),repositories,citymus:city};
}
/** Include repository names in search, so e.g. CITMUS still matches the citymusic index. */
export function projectEvidenceQuery(question:string,scope:ProjectEvidenceScope):string{
 return [question,...scope.repositories.map(x=>x.split("/")[1])].join(" ");
}
/** Distinguish questions requiring verified project data from creative/planning requests. */
export function projectNeedsVerifiedEvidence(question:string):boolean{
 if(/^(?:幫我|請|替我|我想|我要).{0,30}(?:設計|規劃|構想|撰寫|創作|修改|開發|修復|優化|提案|模擬)/.test(question))return false;
 return /(?:目前|現在|最新|已經|現有|內容|有哪些|列出|收錄|文章|歌曲|曲庫|歌單|資料|資訊|功能|版本|狀態|介紹|什麼是|是不是|多少|幾首|查詢|讀取)/.test(question);
}
/** An action cannot be fulfilled by text generation. Do not claim a random song was selected. */
export function projectActionWithoutAdapter(question:string):string|null{
 const scope=projectEvidenceScope(question);
 if(!scope?.citymus)return null;
 if(/^(?:引用|原文|以下文字|請潤稿|幫我翻譯)/.test(question))return null;
 if(/(?:如何|怎麼|為什麼|介紹|功能|實作|新增|修復|開發|設計|測試|範例|能不能|可以嗎)/.test(question))return null;
 if(!/(?:隨機|隨即|random|shuffle).{0,16}(?:選|挑|播|播放).{0,12}(?:歌|曲|首)|(?:選|挑|播|播放).{0,12}(?:一首|歌曲|音樂|曲目)/i.test(question))return null;
 return "已辨識 CITYMUS 選歌指令，但 Vanilla 目前沒有經過驗證的曲庫資料與選歌／播放適配器，無法真正隨機選出或播放歌曲。請先在 PROJECT HUB 匯入可信曲目清單，並為選歌操作連接實際工具；我不會用臆測的歌名冒充已完成。";
}
export function projectEvidenceUnavailable(scope:ProjectEvidenceScope,enabled:boolean):string{
 const paths=scope.repositories.map(x=>"https://github.com/"+x).join("\n");
 return "已辨識 "+scope.label+"，但目前沒有可供這次回答核對的專案內容。"+
  (enabled?"這個帳號／裝置的 PROJECT HUB 沒有找到相關索引；請匯入或更新專案索引。":"你已關閉「專案程式碼」上下文；可在模型與工具面板開啟。")+
  " GitHub 專案入口不等於即時資料同步，無法據此保證歌曲、文章或功能的現況。\n"+
  "可核對的專案入口：\n"+paths;
}
