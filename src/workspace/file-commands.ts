import type {WorkspaceFile} from "./cloud-drive";
export type FileCommand=
 |{kind:"search";query:string;label:string}
 |{kind:"create";name:string;label:string}
 |{kind:"open";file:WorkspaceFile;label:string}
 |{kind:"trash";file:WorkspaceFile;label:string}
 |{kind:"rename";file:WorkspaceFile;name:string;label:string}
 |{kind:"append";file:WorkspaceFile;text:string;label:string};

function exactFile(files:WorkspaceFile[],needle:string):WorkspaceFile{
 const key=needle.trim().replace(/[「」"'‘’]/g,"").toLocaleLowerCase();
 const matching=files.filter(file=>file.name.toLocaleLowerCase()===key);
 if(matching.length===1)return matching[0];
 if(matching.length>1)throw Error("存在多個同名檔案，請直接使用清單上的操作按鈕");
 const contains=files.filter(file=>file.name.toLocaleLowerCase().includes(key));
 if(contains.length===1)return contains[0];
 throw Error(contains.length>1?"找到多個可能的檔案，請輸入完整檔名":"沒有找到「"+needle+"」");
}
export function parseFileCommand(input:string,files:WorkspaceFile[]):FileCommand{
 const text=input.trim();
 if(!text)throw Error("請先描述要執行的檔案操作");
 let m:RegExpExecArray|null;
 if(/^(?:列出|顯示)(?:全部|所有)?檔案$/.test(text))return {kind:"search",query:"",label:"列出全部 Vanilla 雲端檔案"};
 if((m=/^(?:搜尋|尋找|查找|找出)(?:檔案)?\s*[「"]?(.+?)[」"]?$/.exec(text)))return {kind:"search",query:m[1],label:"搜尋檔名包含「"+m[1]+"」的檔案"};
 if((m=/^(?:新增|建立|製作)(?:一份)?(?:空白)?(?:檔案)?\s*[「"]?(.+?)[」"]?$/.exec(text))){
  const name=m[1].trim();
  if(!/\.(txt|md|csv|json)$/i.test(name))throw Error("請輸入副檔名，例如：新增 旅行計畫.md");
  return {kind:"create",name,label:"建立空白雲端檔案「"+name+"」"};
 }
 if((m=/^(?:將|把)?\s*[「"]?(.+?)[」"]?\s*(?:重新命名為|改名為|更名為)\s*[「"]?(.+?)[」"]?$/.exec(text))){
  const file=exactFile(files,m[1]);const name=m[2].trim();
  if(!name||name.length>140)throw Error("新檔名不得為空或超過 140 字元");
  return {kind:"rename",file,name,label:"重新命名「"+file.name+"」為「"+name+"」"};
 }
 if((m=/^(?:刪除|移至垃圾桶|移除)(?:檔案)?\s*[「"]?(.+?)[」"]?$/.exec(text))){
  const file=exactFile(files,m[1]);
  return {kind:"trash",file,label:"將「"+file.name+"」移至 Google Drive 垃圾桶（可還原）"};
 }
 if((m=/^(?:開啟|打開|預覽|讀取)(?:檔案)?\s*[「"]?(.+?)[」"]?$/.exec(text))){
  const file=exactFile(files,m[1]);return {kind:"open",file,label:"開啟「"+file.name+"」"};
 }
 if((m=/^在\s*[「"]?(.+?)[」"]?\s*(?:末尾加入|最後加入|追加)\s*(.+)$/.exec(text))){
  const file=exactFile(files,m[1]);return {kind:"append",file,text:m[2],label:"在「"+file.name+"」最後追加 "+m[2].length+" 個字元（先預覽，再儲存）"};
 }
 throw Error("可試：搜尋 報告、新增 旅行.md、開啟 旅行.md、刪除 旅行.md、把 旅行.md 改名為 行程.md、在 旅行.md 最後加入 住宿資訊");
}
