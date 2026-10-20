/* No network calls, content scripts, cookies or token access.
 * Requires user to open and focus an EMPTY Notion title editor, then press button.
 */
"use strict";
const $=id=>document.getElementById(id);
function parsePayload(text){
 const data=JSON.parse(text);
 if(!data||data.version!==1||data.type!=="vanilla.notion.page-draft"||!data.task)
  throw Error("請貼上 Vanilla 產生的單筆任務資料");
 const task=data.task;
 if(typeof task.title!=="string"||!task.title.trim()||task.title.length>180||
    typeof task.id!=="string"||!/^[a-f0-9-]{36}$/i.test(task.id)||
    typeof task.when!=="string"||!Number.isFinite(Date.parse(task.when))||
    typeof task.done!=="boolean"||typeof task.details!=="string"||task.details.length>1800)
  throw Error("任務格式驗證未通過");
 return task;
}
async function fill(){
 $("fill").disabled=true;
 try{
  const task=parsePayload($("payload").value);
  const tabs=await chrome.tabs.query({active:true,currentWindow:true});
  const tab=tabs[0];
  if(!tab?.id||!/^https:\/\/(?:www\.)?notion\.so(?:\/|$)/i.test(tab.url||""))
   throw Error("請先在目前瀏覽器分頁開啟已登入的 https://www.notion.so/");
  // Inject only a fixed, audited function; never eval/supply browser code in user data.
  const [answer]=await chrome.scripting.executeScript({
   target:{tabId:tab.id},
   func:(title)=>{
    const active=document.activeElement;
    const edit=active?.closest?.('[contenteditable="true"]');
    if(!edit||edit.getAttribute("contenteditable")!=="true"||edit.textContent?.trim())
     return {ok:false,note:"請先點入 Notion 新頁面空白的標題欄位。已有文字的欄位不會被覆寫。"};
    if(!edit.getClientRects().length)return {ok:false,note:"編輯欄不可見"};
    // No selector guessing and no click on confirmation dialogs or other elements.
    edit.focus();
    const selection=window.getSelection();
    if(!selection)return {ok:false,note:"無法讀取編輯位置"};
    const range=document.createRange();
    range.selectNodeContents(edit);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    if(!document.execCommand("insertText",false,title)||!edit.textContent?.includes(title))
     return {ok:false,note:"Notion 編輯器未接受輸入。請改用手動貼上，不要宣稱已寫入。"};
    return {ok:true,note:"只已填入目前欄位文字；請核對它是標題，並自行設定日期與完成狀態。"};
   },args:[task.title]
  });
  if(!answer?.result?.ok)throw Error(answer?.result?.note||"寫入未確認");
  $("status").textContent=answer.result.note;
 }catch(error){
  $("status").textContent="尚未完成："+(error instanceof Error?error.message:String(error));
 }finally{$("fill").disabled=false;}
}
$("fill").addEventListener("click",()=>void fill());
