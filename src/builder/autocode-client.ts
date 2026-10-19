/** Browser client for the separately deployed, authenticated Self-Build GitHub Worker.
 * Public URL stored locally; operator token stored in tab session only.
 * Never write tokens to GitHub Pages, Google Drive, chat logs, or prompts.
 */
export type CodeSource={path:string;sha:string|null;content:string|null;ref:string};
export type CodePatch={title:string;files:{path:string;content:string;expectedSha:string|null}[]};
export type ProposedPR={number:number;url:string;branch:string;sha:string;status:"pending";message:string};
export type CheckState={number:number;sha:string;url:string;status:"pending"|"passed"|"failed";
 message:string;checks:{name:string;status:string;conclusion:string|null;details:string}[];
 annotations:{path:string;message:string;startLine:number}[]};
const URL_KEY="vanilla.builder.github-bridge.url.v1";
const TOKEN_KEY="vanilla.builder.github-bridge.session-token.v1";
export function validateBridgeURL(input:string):string{
 if(!input.trim())return "";
 const url=new URL(input.trim());
 const host=url.hostname.toLowerCase();
 if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||url.port||
 host==="localhost"||host.endsWith(".local")||host.endsWith(".internal")||host.endsWith(".localhost")||
 /^(?:\d+\.\d+\.\d+\.\d+|\[.*\])$/.test(host))throw Error("程式開發後端必須為公開、無帳密的 HTTPS 網域");
 return url.toString().replace(/\/$/,"");
}
export function getCodeBridgeURL():string{
 try{return validateBridgeURL(localStorage.getItem(URL_KEY)||"");}catch{return "";}
}
export function getCodeBridgeToken():string{try{return sessionStorage.getItem(TOKEN_KEY)||"";}catch{return "";}}
export function configureCodeBridge(url:string,token?:string){
 const valid=validateBridgeURL(url);
 if(!valid)throw Error("請先輸入 Self-Build 的 HTTPS Worker URL");
 localStorage.setItem(URL_KEY,valid);
 if(token?.trim())sessionStorage.setItem(TOKEN_KEY,token.trim());
 window.dispatchEvent(new Event("vanilla-builder-bridge-changed"));
}
export function disconnectCodeBridge(){
 try{sessionStorage.removeItem(TOKEN_KEY);}catch{}
 window.dispatchEvent(new Event("vanilla-builder-bridge-changed"));
}
export function safeCodePath(value:string):string{
 const allowed=["src/builder/","src/cream/","src/noodles/","src/local-ai/","src/assistant/","src/workspace/","src/library/","src/ai/","src/search/","src/release/","src/components/","tests/","docs/"];
 if(typeof value!=="string"||value.length>145||value.includes("..")||value.startsWith("/")||
 !/^[a-zA-Z0-9_./-]+$/.test(value)||value.split("/").some(p=>!p||p.startsWith("."))||
 !allowed.some(prefix=>value.startsWith(prefix))||
 /(?:^|\/)(?:auth|credentials?|secrets?|tokens?|keys?|security|trust-boundary|\.env)(?:\.|\/|$)|(?:\.config\.|^src\/version\.ts$|package(?:-lock)?\.json$)/i.test(value)||
 !/\.(?:ts|tsx|css|mjs|md)$/.test(value))throw Error("檔案路徑不在已批准的原始碼範圍");
 return value;
}
export function parseCodePatch(raw:string,source:CodeSource):CodePatch{
 let text=raw.trim();
 const fenced=/^\s*```(?:json)?\s*\n([\s\S]*?)\n```\s*$/i.exec(text);
 if(fenced)text=fenced[1];
 let data:unknown;
 try{data=JSON.parse(text);}catch{throw Error("模型未傳回有效 JSON；無法安全修改原始碼");}
 if(!data||typeof data!=="object")throw Error("模型輸出不是程式修改方案");
 const obj=data as Record<string,unknown>;
 const title=String(obj.title||"").trim();
 if(title.length<6||title.length>120)throw Error("請要求模型回傳 6～120 字元的變更標題");
 if(!Array.isArray(obj.files)||obj.files.length!==1)throw Error("本介面每輪只允許修改指定的單一檔案");
 const file=obj.files[0] as Record<string,unknown>;
 if(!file||safeCodePath(String(file.path))!==source.path)throw Error("模型嘗試修改非指定檔案，已拒絕");
 if(typeof file.content!=="string"||file.content.length<8||file.content.length>25000)throw Error("模型必須回傳完整且不超過 25,000 字元的檔案");
 if(file.content===source.content)throw Error("模型並未產生任何程式變更");
 if(/\b(?:eval\s*\(|new\s+Function\s*\(|dangerouslySetInnerHTML\s*=)/.test(file.content))throw Error("模型產出含危險的動態執行程式");
 return {title,files:[{path:source.path,content:file.content,expectedSha:source.sha}]};
}
async function request<T>(path:string,init:RequestInit={}):Promise<T>{
 const url=getCodeBridgeURL(),token=getCodeBridgeToken();
 if(!url||!token)throw Error("請先設定受保護的 GitHub Self-Build Worker 和本次分頁權杖");
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
 try{
  const res=await fetch(url+path,{...init,mode:"cors",credentials:"omit",redirect:"error",signal:controller.signal,
   headers:{"Authorization":"Bearer "+token,"Accept":"application/json",...(init.body?{"Content-Type":"application/json"}:{})}});
  const data=await res.json().catch(()=>({error:"後端回傳非 JSON 格式"})) as Record<string,unknown>;
  if(!res.ok)throw Error(String(data.error||"Self-Build 服務 HTTP "+res.status).slice(0,250));
  return data as T;
 }finally{clearTimeout(timer);}
}
export async function checkCodeBridge():Promise<{status:string;repo:string;mode:string}>{return request("/health");}
export async function readCodeSource(path:string,prNumber?:number):Promise<CodeSource>{
 return request("/source?path="+encodeURIComponent(safeCodePath(path))+(prNumber?"&pr="+prNumber:""));
}
export async function createCodePR(patch:CodePatch):Promise<ProposedPR>{
 return request("/propose",{method:"POST",body:JSON.stringify(patch)});
}
export async function reviseCodePR(number:number,patch:CodePatch):Promise<ProposedPR>{
 if(!Number.isSafeInteger(number)||number<=0)throw Error("GitHub PR 編號無效");
 return request("/revise?pr="+number,{method:"POST",body:JSON.stringify(patch)});
}
export async function getCodePRStatus(number:number):Promise<CheckState>{
 if(!Number.isSafeInteger(number)||number<=0)throw Error("GitHub PR 編號無效");
 return request("/status?pr="+number);
}
