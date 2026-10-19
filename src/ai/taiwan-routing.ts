/** Taiwan-topic model preference: based on user questions only, never retrieved text. */
export type TaiwanTopic="local"|"law"|"history";
const KEY="vanilla.routing.taide-taiwan.v1";
export function isTaiwanTaideEnabled():boolean{
 try{return localStorage.getItem(KEY)!=="off";}catch{return true;}
}
export function setTaiwanTaideEnabled(enabled:boolean):void{
 try{localStorage.setItem(KEY,enabled?"on":"off");}catch{}
 if(typeof window!=="undefined")window.dispatchEvent(new Event("vanilla-preferences-changed"));
}
/** The administrator must give an Ollama-loaded TAIDE model a recognizable ID. */
export function isTaideModel(model:string):boolean{
 return /(?:^|[^a-z])taide(?:[^a-z]|$)/i.test(model);
}
export function classifyTaiwanTopic(question:string):TaiwanTopic|null{
 const q=question.slice(0,3000).trim();
 if(!q)return null;
 const taiwan=/(?:臺灣|台灣|台北|臺北|新北|桃園|新竹|苗栗|台中|臺中|彰化|南投|雲林|嘉義|台南|臺南|高雄|屏東|宜蘭|花蓮|台東|臺東|澎湖|金門|馬祖|中華民國|我國|本國|國內|健保|國民年金|勞保|勞退|勞基法|台鐵|臺鐵|高鐵|捷運|國道|學測|分科測驗|統測|會考|里長|鄉鎮市區|行政院|立法院|考試院|監察院|司法院|中央選舉委員會|衛福部|內政部|教育部|法務部|國民黨|民進黨|民眾黨)/i.test(q);
 const law=/(?:法律|法規|法條|法令|憲法|民法|刑法|行政法|訴訟|判決|法院|起訴|違法|合法|刑責|罰則|勞基法|勞動基準法|個資法|醫療法|健保法|交通規則|租屋糾紛|消費者保護法|著作權法|稅法|申報所得稅|勞資爭議|侵權行為|契約爭議|法律責任)/i.test(q);
 const history=/(?:歷史|史料|史實|清領|日治|日據|鄭成功|荷西時期|二二八|228事件|白色恐怖|戒嚴|解嚴|美麗島事件|霧社事件|台灣史|臺灣史|中華民國史|戰後臺灣|戰後台灣)/i.test(q);
 const foreign=/(?:美國|日本|英國|法國|德國|韓國|香港|澳門|中國大陸|大陸地區|中華人民共和國|新加坡|加拿大|澳洲|歐盟|印度|俄羅斯|越南)/i.test(q);
 if(taiwan)return law?"law":history?"history":"local";
 if(law&&!foreign)return "law";
 // Some Taiwan-specific historical events are commonly named without saying Taiwan.
 if(history&&/(?:二二八|228事件|霧社事件|美麗島事件|鄭成功)/.test(q))return "history";
 return null;
}
export function preferTaideForTaiwan<T extends {source:string;model:string}>(
 candidates:readonly T[],question:string,enabled=isTaiwanTaideEnabled()
):T[]{
 const ordered=[...candidates];
 if(!enabled||!classifyTaiwanTopic(question))return ordered;
 // Never fabricate a model, override privacy filters, or introduce an unapproved provider.
 const taide=ordered.filter(c=>c.source==="ollama"&&isTaideModel(c.model));
 const others=ordered.filter(c=>!(c.source==="ollama"&&isTaideModel(c.model)));
 return taide.length?[...taide,...others]:ordered;
}
export function taiwanEvidenceGuidance(topic:TaiwanTopic|null):string{
 if(!topic)return "";
 const common="\n\n台灣在地議題：請以臺灣用語與中華民國（臺灣）制度為準；區分已核實資料、推論及不確定資訊，不能假裝即時查過網站或捏造來源。";
 if(topic==="law")return common+" 法律問題優先依全國法規資料庫（law.moj.gov.tw）現行法規、官方函釋與法院判決查核；未提供可查核依據時請明言無法確認最新修法、條號及效力，並區分一般資訊與個案法律意見。";
 if(topic==="history")return common+" 歷史問題請交代時代、原始史料與研究觀點的差異，勿把有爭議的解釋當作定論；可建議核對國史館、國家圖書館或國家文化記憶庫。";
 return common+" 涉及最新政策、規定、費率或公告時，提醒使用者向主管機關核實日期與原文。";
}
