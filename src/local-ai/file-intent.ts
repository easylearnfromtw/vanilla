/** Recognize file actions before dispatching to the LLM. Never invent file access.
 * Named files match exact filename first, then uniquely matching substring.
 */
export type NamedFileIntent={action:"read"|"delete"|"analyze";name:string};
const CODE_EXT=/\.(?:js|jsx|mjs|cjs|ts|tsx|py|rb|go|rs|java|kt|swift|c|cpp|h|cs|sh|sql|css|html|json|jsonl|yaml|yml|toml|xml|vue|svelte|md|txt|csv|tsv|pdf|docx|pptx|xlsx)$/i;
export function filenameFromQuestion(question:string):NamedFileIntent|null{
 const q=question.trim();
 if(q.length<4||q.length>420)return null;
 const action:NamedFileIntent["action"]=/(?:刪除|移除|丟進垃圾桶|移至垃圾桶|清除)/.test(q)?"delete":
  /(?:分析|檢查|審查|解釋|debug|研究|統整|摘要|整理|訓練|學習)/i.test(q)?"analyze":"read";
 if(!/(?:讀取|閱讀|查看|打開|開啟|載入|分析|檢查|審查|解釋|刪除|移除|清除|整理|摘要|統整|研究|訓練|學習|檔案|文件|附件|程式)/.test(q))return null;
 const named=[...q.matchAll(/(?:`([^`]{1,150})`|「([^」]{1,150})」|"([^"]{1,150})"|(?:^|[\s：:，,（(])([\w.\-/]{1,150}))/g)]
  .map(m=>m[1]||m[2]||m[3]||m[4]).filter(Boolean);
 const paths=named.filter(n=>CODE_EXT.test(n));
 const name=paths.find(Boolean);
 if(!name)return null;
 if(name.includes("..")||name.startsWith("/")||name.length>150)return null;
 return {name,action};
}
export type IndexedFile={id:string;name:string};
export function matchNamedFile<T extends IndexedFile>(list:readonly T[],name:string):T|null{
 const normalized=name.trim().toLocaleLowerCase();
 const exact=list.filter(x=>x.name.toLocaleLowerCase()===normalized);
 if(exact.length===1)return exact[0];
 if(exact.length>1)throw Error("存在 "+exact.length+" 個同名檔案，請在檔案庫選擇明確的一份");
 const partial=list.filter(x=>x.name.toLocaleLowerCase().includes(normalized));
 if(partial.length===1)return partial[0];
 if(partial.length>1)throw Error("找到多個相似檔名："+partial.slice(0,5).map(x=>x.name).join("、")+"；請提供完整檔名");
 return null;
}
