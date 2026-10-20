/** Grounded read-only answers about Vanilla's own tools.
 * Registry metadata is not proof of remote deployment or successful execution.
 */
import {DETROIT_CAPABILITIES,detroitAvailability,type DetroitCapability} from "../detroit/capability-bus";
import {BUILTIN_TOOLS} from "../weiguo/registry";

export type ToolKnowledgeIntent={scope:"overview"|"named";ids:string[]};
const ALIASES:Record<string,readonly string[]>={
 "diana":["黛安娜"],"victoria":["維多利亞"],"merlin":["梅林"],
 "scouts":["Scout"],"er-ya":["Erya","爾雅"],
 "retina":["視網膜"],"jensen-huang":["Self-Build CODE"],
 "persistent-jobs":["Persistent Jobs"],"holy-roman-empire":["Holy Roman Empire"],
 "orchestra":["Orchestra Studio"],"janus":["Email Studio"],"venus":["維納斯"]
};
const NOTE="資料來自目前版本的程式登錄；工具存在不代表遠端後端已部署、權限已核准或操作已成功。";
const QUESTION=/(?:是什麼|什麼是|有什麼|有哪些|清單|列表|功能|用途|介紹|負責|作用|用來|做什麼|在做什麼|怎麼用|如何使用|怎麼使用|可以做|能做|現況|狀態|進度|上線|可用|完成了嗎|支援|差別|比較|區別|架構|怎麼運作|有何不同)/i;
const ACTION=/^(?:幫我(?:寫|潤稿|改寫|翻譯|整理成)|請(?:寫|潤稿|改寫|翻譯)|開啟|打開|前往|執行|啟動|使用|開始|新增|修改|刪除|建立|製作|生成|產生|下載|分析|寄送|發送|把|請執行|請建立|幫我(?:執行|建立|新增|修改|做|製作|修復|寄送|刪除))/i;
const QUOTED=/^(?:【待潤稿原文】|原文如下|以下是原文|引用：|引述：|>|\x60\x60\x60)/;
function matchesName(question:string,name:string):boolean{
 const n=name.trim();if(!n)return false;
 if(!/[a-z]/i.test(n))return question.includes(n);
 const escaped=n.replace(/[^A-Za-z0-9\u4e00-\u9fff]/g,char=>"\\"+char);
 return new RegExp("(^|[^A-Za-z0-9])"+escaped+"(?=$|[^A-Za-z0-9])","i").test(question);
}
export function referencedTools(question:string):DetroitCapability[]{
 const q=question.slice(0,1800);
 return DETROIT_CAPABILITIES.filter(c=>[c.id,c.label,...(ALIASES[c.id]||[])].some(n=>matchesName(q,n)));
}
const weiguoMention=(q:string)=>["衛國","衞國","WeiGuo"].some(n=>matchesName(q,n));
export function toolKnowledgeIntent(question:string):ToolKnowledgeIntent|null{
 const q=question.trim().replace(/[？！!?。．\s]+$/g,"");
 if(!q||q.length>200||QUOTED.test(q)||ACTION.test(q))return null;
 if(/^(?:(?:請問|介紹|說明|解釋|我想知道)\s*)?(?:Detroit|底特律|Orchestra)(?:是什麼|有什麼功能|能做什麼|怎麼運作|有哪些工具|的工具有哪些|的架構)?$/i.test(q)||
  /^(?:我有哪些(?:其他)?工具|我的其他工具有哪些|Vanilla有哪些工具|你有哪些工具)$/i.test(q))
  return {scope:"overview",ids:[]};
 const overview=/^(?:(?:請問|想知道|我想知道|我想了解|請介紹|介紹|列出|整理|說明|告訴我|幫我整理|幫我列出)\s*)?(?:Detroit|底特律|Orchestra|Vanilla|我(?:的)?|你(?:的)?|目前|現有|全部|所有|其他|自建)?(?:的)?(?:工具|模組|引擎)(?:們)?(?:有哪些|是什麼|介紹|列表|清單|功能|架構|有哪些功能|有哪些工具|有什麼|現況|狀態)?$/i;
 if(overview.test(q)||/(?:Detroit|底特律|Orchestra).{0,10}(?:有哪些工具|有哪些模組|有什麼工具|功能列表|工具清單|整體架構)/i.test(q)||
  /^(?:Detroit|底特律|我的工具|工具有哪些)$/i.test(q)||/(?:我|Vanilla).{0,8}(?:還有|有).{0,6}(?:哪些|什麼)(?:其他)?工具/i.test(q))
  return {scope:"overview",ids:[]};
 const ids=referencedTools(q).map(x=>x.id);
 if(weiguoMention(q))ids.push("weiguo");
 if(!ids.length||!QUESTION.test(q))return null;
 // Troubleshooting and change requests need the normal model, backed by facts.
 if(/(?:為什麼|無法|失敗|錯誤|異常|修復|改善|優化|如何整合|怎麼整合|加入|設計|規劃|差別|比較|區別|有何不同)/i.test(q))return null;
 return {scope:"named",ids:[...new Set(ids)].slice(0,5)};
}
function stateSummary(c:DetroitCapability):string{
 const running=detroitAvailability().some(s=>s.id===c.id&&s.state==="runnable");
 if(c.state==="planned")return "規劃中，尚不可執行";
 if(running)return "本裝置 Capability Bus 已註冊執行器（能否完成仍以實際回執為準）";
 if(c.state==="local")return "內建角色／本機流程；不代表有獨立可呼叫的後端";
 return "選用適配器；Capability Bus 尚無註冊執行器，實際後端與權限需另行查驗";
}
function oneTool(c:DetroitCapability):string{
 return c.label+"（"+c.id+"）｜"+stateSummary(c)+"\n"+c.description;
}
function weiGuoDescription():string{
 return "衞國（WeiGuo）｜宣告式工具登錄及受控瀏覽器／後端適配入口；已有的登錄項目："+BUILTIN_TOOLS.map(t=>t.label+(t.enabled?"（標示啟用）":"（標示關閉）")).join("、")+"。啟用標記不保證後端部署或可連線。";
}
export function toolKnowledgeAnswer(question:string):string{
 const intent=toolKnowledgeIntent(question);
 if(!intent)return "";
 if(intent.scope==="overview")return "Vanilla／Detroit 工具一覽\nDetroit 是 AI 內部理解、規劃、調度和使用能力的架構；Merlin 理解需求、Diana 選工具、Zeus 協調執行、Athena 管控安全。這些名稱不是一個個獨立 AI 模型。\n\n"+
  DETROIT_CAPABILITIES.map(c=>"• "+c.label+"（"+c.id+"）— "+c.description+"【"+(c.state==="planned"?"規劃中":c.state==="adapter"?"適配器／需驗證":"內建")+"】").join("\n")+
  "\n\n衞國另有受控工具登錄。"+NOTE+"\n也可以直接問任何工具的用途、差別、限制或狀態。";
 const details=intent.ids.map(id=>id==="weiguo"?weiGuoDescription():DETROIT_CAPABILITIES.find(c=>c.id===id)).map(v=>typeof v==="string"?v:v?oneTool(v):"").filter(Boolean);
 return "Vanilla 工具說明\n\n"+details.join("\n\n")+"\n\n"+NOTE;
}
/** Ground the model for complex tool questions without hijacking actual commands. */
export function toolKnowledgeGuidance(question:string):string{
 const q=question.trim();
 if(!q||q.length>2200||QUOTED.test(q))return "";
 const named=referencedTools(q).slice(0,4);
 if(!named.length&&!weiguoMention(q))return "";
 return "\n[Vanilla 程式自身的工具登錄資訊（不是即時網頁）]\n"+named.map(oneTool).join("\n")+
  (weiguoMention(q)?"\n"+weiGuoDescription():"")+
  "\n回答工具問題時應根據上述功能與限制，而不是說不知道此工具；尚未有實際執行回執時，不可聲稱已完成操作。登錄狀態不等於後端部署；沒有獨立按鈕不代表工具不存在。\n";
}
