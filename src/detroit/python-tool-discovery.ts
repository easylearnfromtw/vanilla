/** Diana -> Zeus read-only public Python tool discovery.
 * Deliberate user request only: never install or run external source code.
 */
import {fetchApiDirectory,searchApiCandidates,type ApiCandidate} from "./api-registry";

const REQUEST=/(?:推薦|有哪些|有什麼|列出|尋找|幫我找|找出|挑選|選擇|比較|清單|好用的|適合的|recommend|suggest|find)/i;
const PYTHON=/(?:\bpython\b|\bpypi\b|\bpip3?\b)/i;
const TOOLS=/(?:工具|套件|函式庫|框架|程式庫|package|library|libraries|framework|SDK|開源)/i;
const SOURCE=/(?:原文如下|以下是原文|引用：|引述：|【待潤稿原文】|^>)/;

export function pythonToolDiscoveryIntent(question:string):boolean{
 const q=question.trim();
 return q.length>=6&&q.length<=400&&!SOURCE.test(q)&&PYTHON.test(q)&&REQUEST.test(q)&&TOOLS.test(q);
}
export function pythonToolSearchTerm(question:string):string{
 const q=question.trim().toLowerCase();
 const named=/\b(langgraph|langchain|pydantic-ai|crewai|fastapi|django|ruff|pytest|vllm|ollama|mem0|llama-index|pytorch|polars|pandas|scrapy|opencv)\b/i.exec(q);
 if(named)return named[1].toLowerCase();
 const mappings:[RegExp,string][]=[
  [/(?:agent|智能體|代理協作|多代理|multi.?agent)/i,"AI and Agents"],
  [/(?:本地.*模型|本機.*模型|local.*llm|模型推論)/i,"Local LLM Inference"],
  [/(?:模型部署|推論服務|llm serving|serve.*model)/i,"LLM Serving"],
  [/(?:資料分析|數據分析|data analysis)/i,"Data Analysis"],
  [/(?:程式碼.*分析|靜態分析|lint|code analysis)/i,"Code Analysis"],
  [/(?:安全|供應鏈|弱點|資安|security)/i,"Supply Chain Security"],
  [/(?:爬蟲|擷取網頁|web scraping|scrap)/i,"Web Scraping"],
  [/(?:網站後端|web framework|後端框架|web api)/i,"Web Frameworks"],
  [/(?:機器學習|machine learning)/i,"Machine Learning"],
  [/(?:自動化測試|單元測試|testing)/i,"Testing"],
  [/(?:影像辨識|電腦視覺|computer vision)/i,"Computer Vision"],
  [/(?:資料視覺化|data visualization|視覺化)/i,"Data Visualization"],
  [/(?:工作排程|job schedul)/i,"Job Schedulers"]
 ];
 return mappings.find(([pattern])=>pattern.test(q))?.[1]??"";
}
export function pythonToolDiscoveryAnswer(question:string,candidates:readonly ApiCandidate[]):string{
 const term=pythonToolSearchTerm(question);
 const matches=searchApiCandidates(candidates,term,8);
 const header="Diana → Zeus｜Awesome Python 公開索引（唯讀）";
 const intro="這些項目只是第三方清單所列候選工具，尚未核對維護狀態、授權、相依套件或資安。";
 if(!matches.length)return header+"\n"+intro+"\n沒有找到符合「"+(term||"全部類別")+"」的候選項目。可改用具體工具名稱或分類查詢。";
 return header+"\n"+intro+"\n"+
  matches.map((item,i)=>(i+1)+". "+item.name+"（"+(item.subCategory||"未分類")+"）— "+item.description+"\n"+item.listingUrl).join("\n")+
  "\n來源：https://github.com/vinta/awesome-python"+
  "\nAthena／Quirinus 尚未核准安裝或執行；Diana 不會直接下載外部程式或啟用付費服務。";
}
export async function discoverPythonTools(question:string,options:{
 privateMode:boolean;online:boolean;fetcher?:typeof fetch
}):Promise<string>{
 if(!pythonToolDiscoveryIntent(question))throw Error("這不是明確的 Python 開源工具推薦要求");
 const candidates=await fetchApiDirectory("python",options);
 return pythonToolDiscoveryAnswer(question,candidates);
}
