import type {SheetPreviewData} from "./sheet-preview-model";
import "./sheet-preview.css";

export default function SheetPreview({sheet,onEdit}:{sheet:SheetPreviewData;onEdit:()=>void}){
 const visible=sheet.rows.slice(0,16),width=Math.min(12,Math.max(1,...visible.map(row=>row.length)));
 return <section className="vanilla-sheet-preview" aria-label={"實際表格："+sheet.name}>
  <div className="vanilla-sheet-preview-title"><strong>{sheet.name}</strong><small>可編輯工作簿 · 本機預覽</small></div>
  <div className="vanilla-sheet-preview-scroll"><table><thead><tr>{Array.from({length:width},(_,i)=><th key={i}>{visible[0]?.[i]||"欄位 "+(i+1)}</th>)}</tr></thead>
   <tbody>{visible.slice(1).map((r,i)=><tr key={i}>{Array.from({length:width},(_,j)=><td key={j}>{r[j]??""}</td>)}</tr>)}</tbody></table></div>
  <div className="vanilla-sheet-preview-actions"><small>顯示前 {visible.length} 列 · 完整表格在 Sheets 開啟</small><button type="button" onClick={onEdit}>開啟實際表格並編輯 ↗</button></div>
 </section>;
}
