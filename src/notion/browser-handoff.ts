/** No-API Notion handoff. Creates local-only portable data, never calls the web.
 * Notion website import/edit is a deliberate user action, not confirmed sync.
 */
import type {LocalScheduleTask} from "./local-schedule";

export const NOTION_BROWSER_URL="https://www.notion.so/";
type Portable=Pick<LocalScheduleTask,"id"|"title"|"when"|"done"|"details">;
const UUID=/^[a-f0-9-]{36}$/i;
export type NotionPageDraft={version:1;type:"vanilla.notion.page-draft";task:{id:string;title:string;when:string;done:boolean;details:string}};

function clean(task:Portable):NotionPageDraft["task"]{
 if(!UUID.test(task.id)||typeof task.title!=="string"||!task.title.trim()||task.title.length>180
   ||typeof task.when!=="string"||!Number.isFinite(Date.parse(task.when))
   ||typeof task.done!=="boolean"||typeof task.details!=="string"||task.details.length>1800)
  throw Error("無法匯出格式不正確的本機任務");
 return {id:task.id,title:task.title.trim(),when:new Date(task.when).toISOString(),done:task.done,details:task.details};
}
export function notionPageDraft(task:Portable):string{
 return JSON.stringify({version:1,type:"vanilla.notion.page-draft",task:clean(task)} satisfies NotionPageDraft);
}
function cell(raw:string):string{
 // CSV/Excel formula injection guard, even though Notion normally treats these as text.
 let value=raw.replace(/\u0000/g,"");
 if(/^[\s]*[=+@-]/.test(value))value="'"+value;
 return '"'+value.replace(/"/g,'""')+'"';
}
/** UTF-8 BOM aids Traditional Chinese import. Never includes an account ID or auth token. */
export function notionTasksCsv(items:readonly Portable[]):string{
 if(items.length===0||items.length>200)throw Error("請選擇 1–200 筆本機任務");
 const lines=["Name,When,Done,Details"];
 for(const entry of items){
  const task=clean(entry);
  lines.push([cell(task.title),cell(task.when),cell(task.done?"TRUE":"FALSE"),cell(task.details)].join(","));
 }
 return "\uFEFF"+lines.join("\r\n")+"\r\n";
}
/** Filename uses no task title or other private data. */
export const NOTION_CSV_FILENAME="vanilla-notion-tasks.csv";
