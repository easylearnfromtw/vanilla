import {parseWorkbook,setCell,getCell,cellAddress,decodeAddress,type Workbook} from "../workspace/sheets-model.ts";
const WORKBOOKS="vanilla.sheets.workbooks.v1",CURRENT="vanilla.sheets.current.v1";
export type SpreadsheetOperation={
 workbookId:string;workbookName:string;edits:Array<{cell:string;from:string;to:string}>;summary:string;
};
export function activeWorkbook():Workbook{
 let rows:unknown;
 try{rows=JSON.parse(localStorage.getItem(WORKBOOKS)||"[]");}catch{throw Error("表格草稿資料損壞，請先匯出備份");}
 if(!Array.isArray(rows)||!rows.length)throw Error("尚無本機表格。請先說「幫我建立家庭收支表格」");
 const books=rows.flatMap(raw=>{try{return [parseWorkbook(raw)];}catch{return [];}});
 if(!books.length)throw Error("本機沒有可編輯的有效工作簿");
 const id=localStorage.getItem(CURRENT)||"";
 return books.find(x=>x.id===id)||books[0];
}
export function proposeSheetAction(prompt:string,book?:Workbook):SpreadsheetOperation|null{
 const question=prompt.trim();
 const isTargeted=/(?:表格|工作簿|試算表|儲存格|工作表)/.test(question);
 const isDirect=/^(?:表格)?\s*(?:在|將|把)?\s*[A-Z]{1,2}[1-9]\d*\s*(?:=|設為|改成|填入|輸入)/i.test(question);
 if(!isTargeted&&!isDirect)return null;
 let selected:Workbook;
 try{selected=book||activeWorkbook();}catch(error){if(isDirect||isTargeted&&/(?:改|填|新增|寫入|刪|清除)/.test(question))throw error;return null;}
 // Accept batches e.g. 在表格 A2 設為 100，B2=2
 const parts=question.replace(/^(?:幫我|請|麻煩你)?(?:在|把|將)?(?:我的|目前|這份|這張)?(?:表格|工作簿|試算表|工作表|儲存格)\s*/,"")
  .split(/\s*(?:；|;|\n|，(?=\s*(?:把|在|將)?\s*[A-Z]{1,2}[1-9]))\s*/i).map(x=>x.trim()).filter(Boolean);
 const edits=new Map<string,{cell:string;from:string;to:string}>();
 for(const text of parts){
  const matched=/^(?:在|將|把)?\s*([A-Z]{1,2}[1-9]\d*)\s*(?:=|設為|改成|填入|輸入|更新為|調整成)\s*(.{0,10000})$/i.exec(text);
  const clear=/^(?:清空|清除|刪除)\s*([A-Z]{1,2}[1-9]\d*)$/i.exec(text);
  if(!matched&&!clear)return null;
  const address=(matched?.[1]||clear?.[1]||"").toUpperCase();
  if(!decodeAddress(address))throw Error("儲存格超出支援範圍 A1:Z200");
  const to=matched?matched[2]:"";
  edits.set(address,{cell:address,from:getCell(selected,address).raw,to});
 }
 if(!edits.size||edits.size>30)throw Error("單次對話最多修改 30 格，請拆成多個動作");
 const distinct=[...edits.values()].filter(x=>x.from!==x.to);
 return {workbookId:selected.id,workbookName:selected.name,edits:distinct,summary:"修改「"+selected.name+"」的 "+distinct.length+" 個儲存格"};
}
export function commitSheetAction(operation:SpreadsheetOperation):Workbook{
 if(!operation.edits.length)throw Error("沒有需要更新的內容");
 let parsed:unknown;
 try{parsed=JSON.parse(localStorage.getItem(WORKBOOKS)||"[]");}catch{throw Error("表格本機資料無法讀取");}
 if(!Array.isArray(parsed))throw Error("沒有可編輯的工作簿");
 const books=parsed.map(parseWorkbook);
 const index=books.findIndex(x=>x.id===operation.workbookId);
 if(index<0)throw Error("原工作簿已被刪除，未執行任何修改");
 let next=books[index];
 // Strict compare-before-write: do not apply changes to stale data.
 for(const edit of operation.edits){
  if(getCell(next,edit.cell).raw!==edit.from)throw Error(edit.cell+" 已被其他操作更新，請重新提出修改要求");
  next=setCell(next,edit.cell,edit.to);
 }
 books[index]=next;
 localStorage.setItem(WORKBOOKS,JSON.stringify(books));
 localStorage.setItem(CURRENT,operation.workbookId);
 window.dispatchEvent(new Event("vanilla-sheet-external-changed"));
 return next;
}
