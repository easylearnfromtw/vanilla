import test from "node:test";
import assert from "node:assert/strict";
import {newWorkbook,setCell,cellValue,cellDisplay,parseWorkbook,parseCSV,toCSV,importRows,decodeAddress} from "../src/workspace/sheets-model.ts";
import {parseFileCommand} from "../src/workspace/file-commands.ts";

test("Vanilla Sheets basic formulas and references",()=>{
 let book=newWorkbook("測試");
 book=setCell(book,"A1","10");
 book=setCell(book,"A2","20");
 book=setCell(book,"B1","=SUM(A1:A2)");
 book=setCell(book,"B2","=AVERAGE(A1:A2)");
 book=setCell(book,"B3",'=IF(A1>5,"通過","不通過")');
 book=setCell(book,"B4","=ROUND(3.1415926,2)");
 book=setCell(book,"B5","=MAX(A1:A2)");
 book=setCell(book,"B6","=A1*2+A2/2");
 assert.equal(cellValue(book,"B1"),30);
 assert.equal(cellValue(book,"B2"),15);
 assert.equal(cellValue(book,"B3"),"通過");
 assert.equal(cellValue(book,"B4"),3.14);
 assert.equal(cellValue(book,"B5"),20);
 assert.equal(cellValue(book,"B6"),30);
});
test("Circular formulas and unsafe input do not execute",()=>{
 let book=newWorkbook();
 book=setCell(book,"A1","=A1");
 assert.equal(cellValue(book,"A1"),"#CYCLE!");
 book=setCell(book,"A2","=2/0");
 assert.equal(cellDisplay(book,"A2"),"#DIV/0!");
 book=setCell(book,"A3","+IMPORTDATA(https://example.com)");
 assert.match(toCSV(book),/'\+IMPORTDATA/);
});
test("CSV parser handles quotes and multiline content",()=>{
 const data=parseCSV('名字,內容\n"Apple","a,b"\n"Test","Line 1\nLine 2"');
 assert.equal(data[1][1],"a,b");
 assert.equal(data[2][1],"Line 1\nLine 2");
 const book=importRows(newWorkbook(),data);
 assert.equal(cellDisplay(book,"B2"),"a,b");
 assert.equal(parseWorkbook(JSON.parse(JSON.stringify(book))).name,book.name);
 assert.deepEqual(decodeAddress("Z200"),{row:199,col:25});
 assert.equal(decodeAddress("AA1"),null);
});
test("Cloud file natural language instructions are explicit, not automatic",()=>{
 const files=[{id:"one",name:"旅行.md",mimeType:"text/markdown",version:"1"}];
 assert.deepEqual(parseFileCommand("搜尋 報告",files).kind,"search");
 assert.equal(parseFileCommand("新增 預算.csv",files).kind,"create");
 assert.equal(parseFileCommand("刪除 旅行.md",files).kind,"trash");
 const rename=parseFileCommand("把 旅行.md 改名為 行程.md",files);
 assert.equal(rename.kind,"rename");
 if(rename.kind==="rename")assert.equal(rename.name,"行程.md");
 assert.equal(parseFileCommand("在 旅行.md 最後加入 住宿資訊",files).kind,"append");
 assert.throws(()=>parseFileCommand("刪除 不存在.md",files));
});
