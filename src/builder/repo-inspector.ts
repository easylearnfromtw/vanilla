/** Read-only self inspection via GitHub public source; authenticated Worker
 * remains mandatory for private repositories and *all* source writes.
 */
import {safeCodePath,readCodeSource,getCodeBridgeURL,getCodeBridgeToken,type CodeSource} from "./autocode-client";
export type SelfInspection={path:string;sha:string|null;summary:string;warnings:string[];excerpt:string;source:"public-github"|"worker"};
export function inspectOwnCode(path:string,source:string):Omit<SelfInspection,"sha"|"source">{
 const lines=source.split(/\r?\n/);
 const warnings:string[]=[];
 if(/\bTODO\b|\bFIXME\b/i.test(source))warnings.push("有未完成標記 TODO／FIXME，需核對是否仍待處理");
 if(/window\.confirm\(/.test(source))warnings.push("此檔案使用確認對話框，可檢視是否造成不必要操作中斷");
 if(/dangerouslySetInnerHTML|\beval\s*\(/.test(source))warnings.push("發現動態執行／HTML 插入相關字串，需人工安全審查");
 if(/catch\s*(?:\([^)]*\))?\s*\{\s*\}/.test(source))warnings.push("存在未說明錯誤原因的空 catch，可能隱藏失敗");
 if(!/test|spec|\.md$/i.test(path))warnings.push("靜態檢查不等於完整程式正確性；請搭配 GitHub CI");
 const exports=(source.match(/\bexport\s+(?:async\s+)?(?:function|const|type|interface|class)\s+\w+/g)||[]).slice(0,12);
 const summary="已讀取 "+path+"（"+lines.length+" 行／"+source.length+" 字元）。"+
  (exports.length?"\n公開介面："+exports.join("、"):"\n未偵測到具名 export")+
  (warnings.length?"\n檢查提示："+warnings.map((w,i)=>(i+1)+". "+w).join("；"):"\n未發現目前規則可辨識的異常，仍需 CI 測試。");
 return {path,summary,warnings,excerpt:source.slice(0,3500)};
}
export async function readOwnSource(path:string):Promise<CodeSource&{source:"public-github"|"worker"}>{
 const safe=safeCodePath(path);
 if(getCodeBridgeURL()&&getCodeBridgeToken()){
  try{return {...await readCodeSource(safe),source:"worker"};}
  catch{/* Allow read-only public API fallback, but never write or claim authentication. */}
 }
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9000);
 try{
  const url="https://api.github.com/repos/easylearnfromtw/vanilla/contents/"+
   safe.split("/").map(encodeURIComponent).join("/")+"?ref=main";
  const res=await fetch(url,{mode:"cors",credentials:"omit",signal:controller.signal,headers:{Accept:"application/vnd.github+json"}});
  if(!res.ok)throw Error("GitHub 唯讀 API HTTP "+res.status+"；私人儲存庫需設定受保護 Self-Build Worker");
  const raw=await res.json() as {encoding?:string;content?:string;size?:number;sha?:string};
  if(raw.encoding!=="base64"||typeof raw.content!=="string"||Number(raw.size)>35000)throw Error("程式檔不存在、太大或非文字原始碼");
  const encoded=raw.content.replace(/\s/g,"");
  const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
  return {path:safe,sha:raw.sha||null,content:new TextDecoder().decode(bytes),ref:"main",source:"public-github"};
 }finally{clearTimeout(timer);}
}
export async function inspectOwnRepository(paths:string[]):Promise<SelfInspection[]>{
 const out:SelfInspection[]=[];
 for(const path of [...new Set(paths)].slice(0,7)){
  const source=await readOwnSource(path);
  if(!source.content)continue;
  out.push({...inspectOwnCode(path,source.content),sha:source.sha,source:source.source});
 }
 return out;
}
export function selfInspectIntent(q:string):string[]|null{
 const matches=q.trim().match(/^(?:檢查|分析|查看|讀取|掃描|審查|學習|訓練參考)?(?:一下)?(?:Vanilla|我的|自己|你自己的|專案)?(?:的)?(?:GitHub|原始碼|程式碼|專案檔案|程式檔案)(?:[：:]?\s*([\s\S]*))?$/i);
 if(!matches)return null;
 const paths=matches[1]?.match(/(?:src|tests|docs)\/[a-zA-Z0-9_.\/-]+\.(?:ts|tsx|mjs|css|md)/g);
 return paths?.length?paths.slice(0,7):["src/local-ai/LocalChat.tsx","src/noodles/core.ts","src/cream/core.ts","src/search/web-reader.ts"];
}
