import {useMemo,useState} from "react";
import "./price-intelligence.css";
import {ArrowUpRight,BarChart3,Download,RefreshCw,ShieldCheck} from "lucide-react";
import {comparePrices,parsePriceRecords,priceProductKey,priceSearchSources,type PriceRecord} from "./price-engine";

const KEY="vanilla.octuber.prices.v1";
const EXAMPLE="product,sku,merchant,source,price,observed_at\n藍牙耳機 ABC,ABC-001,商家甲,biggo,1590,2026-10-24T10:00:00+08:00\n藍牙耳機 ABC,ABC-001,商家乙,feebee,1690,2026-10-24T10:10:00+08:00";
function loadStoredPrices():PriceRecord[]{
 try{
  const value:unknown=JSON.parse(localStorage.getItem(KEY)||"[]");
  if(!Array.isArray(value))return [];
  return value.filter((x):x is PriceRecord=>Boolean(x&&typeof x==="object"&&
   typeof x.product==="string"&&typeof x.price==="number"&&Number.isFinite(x.price)&&x.price>0&&
   typeof x.merchant==="string"&&typeof x.source==="string"&&typeof x.sku==="string"&&
   typeof x.importedAt==="number"&&typeof x.id==="string")).slice(-500);
 }catch{return [];}
}
function money(value:number):string{return "NT$ "+Math.round(value).toLocaleString("zh-TW");}

export default function PriceIntelligencePanel(){
 const [rows,setRows]=useState<PriceRecord[]>(loadStoredPrices);
 const [feed,setFeed]=useState("");
 const [status,setStatus]=useState("尚未載入報價。請提供你有權使用的 CSV／JSON 價格資料。");
 const [selected,setSelected]=useState("");
 const [current,setCurrent]=useState("");
 const [cost,setCost]=useState("");
 const [margin,setMargin]=useState("20");
 const products=useMemo(()=>{
  const map=new Map<string,string>();
  rows.forEach(x=>map.set(priceProductKey(x),x.product+(x.sku?" · "+x.sku:"")));
  return [...map];
 },[rows]);
 const selectedKey=products.some(([key])=>key===selected)?selected:(products[0]?.[0]||"");
 const selectedRows=rows.filter(x=>priceProductKey(x)===selectedKey).sort((a,b)=>a.price-b.price);
 const minimumMargin=Number(margin)/100;
 const validInputs=Number(current)>0&&Number(cost)>=0&&cost.trim()!==""&&minimumMargin>=0&&minimumMargin<1;
 const summary=validInputs?comparePrices(rows,selectedKey,{
  currentPrice:Number(current),cost:Number(cost),minimumMargin,maxChangeRate:0.1
 }):null;
 function updateRows(items:PriceRecord[]){
  const next=[...rows,...items].slice(-500);
  try{localStorage.setItem(KEY,JSON.stringify(next));setRows(next);setStatus("匯入 "+items.length+" 筆報價，僅儲存在此裝置。資料未經來源網站即時驗證。");}
  catch{setStatus("本機空間不足，未儲存報價；請清理瀏覽器儲存空間後重試。");}
 }
 function importPrices(){
  try{const items=parsePriceRecords(feed);if(!items.length)throw Error("請先提供至少一筆報價");updateRows(items);setFeed("");}
  catch(error){setStatus("匯入失敗："+String(error instanceof Error?error.message:error));}
 }
 function exportPrices(){
  const data=JSON.stringify(rows,null,2);
  const blob=new Blob([data],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download="octuber-prices.json";a.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),2000);
 }
 return <section className="octuber-pricing" aria-label="OCTUBER 比價與價格策略">
  <div className="octuber-pricing-head"><div><span className="octuber-pricing-overline">OCTUBER / PRICE INTELLIGENCE</span>
   <h2>比價與價格策略</h2><p>跨來源報價整理、歷史保存、參考定價。不會未經授權抓取網頁，也不會自動修改任何商品售價。</p></div><BarChart3 size={28}/></div>
  <div className="octuber-price-sites">
   {priceSearchSources().map(site=><a key={site.id} href={site.url} target="_blank" rel="noopener noreferrer">{site.label} <ArrowUpRight size={13}/></a>)}
  </div>
  <p className="octuber-pricing-note"><ShieldCheck size={14}/> 以上為外部人工比價入口，並非已連接的 API。飛比禁止未授權自動化蒐集，樂天比價網也有網站驗證；取得合法 API／資料授權後才可接入自動同步。</p>
  <div className="octuber-pricing-upload">
   <label htmlFor="octuber-feed">匯入授權來源價格資料（CSV 或 JSON）</label>
   <textarea id="octuber-feed" rows={4} value={feed} onChange={e=>setFeed(e.target.value)} placeholder={"product,sku,merchant,source,price,observed_at\n商品型號,SKU-123,商家甲,biggo,1599,2026-10-24T10:00:00+08:00"}/>
   <div className="octuber-pricing-actions">
    <label className="octuber-file-label">選擇檔案<input type="file" accept=".csv,.json,text/csv,application/json" onChange={e=>{const file=e.target.files?.[0];if(file)void file.text().then(setFeed).catch(()=>setStatus("無法讀取檔案"));e.target.value="";}}/></label>
    <button type="button" onClick={()=>setFeed(EXAMPLE)}>填入格式範例</button>
    <button type="button" className="primary" onClick={importPrices} disabled={!feed.trim()}>驗證並匯入</button>
   </div>
   <p className="octuber-pricing-note">資料欄位：product、sku、merchant、source、price、observed_at（ISO 8601）；幣別固定 TWD。請只提供有權使用的報價，不要貼入網站帳密或 API Key。</p>
  </div>
  <div className="octuber-pricing-actions">
   <strong>已儲存 {rows.length} 筆報價</strong>
   <button type="button" disabled={!rows.length} onClick={exportPrices}><Download size={13}/>匯出 JSON</button>
   <button type="button" disabled={!rows.length} onClick={()=>{if(window.confirm("確定清除此裝置的價格紀錄？")){localStorage.removeItem(KEY);setRows([]);setStatus("本機價格資料已清除");}}}><RefreshCw size={13}/>清除紀錄</button>
  </div>
  <p role="status" aria-live="polite" className="octuber-pricing-note">{status}</p>
  {products.length>0&&<div className="octuber-pricing-analysis">
   <label htmlFor="octuber-product">比較同一規格商品<select id="octuber-product" value={selectedKey} onChange={e=>setSelected(e.target.value)}>{products.map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label>
   <div className="octuber-pricing-grid">
    <label>目前售價（NT$）<input inputMode="decimal" type="number" min="1" value={current} onChange={e=>setCurrent(e.target.value)} placeholder="例如 1890"/></label>
    <label>商品完全成本（NT$）<input inputMode="decimal" type="number" min="0" value={cost} onChange={e=>setCost(e.target.value)} placeholder="例如 1200"/></label>
    <label>最低毛利率<select value={margin} onChange={e=>setMargin(e.target.value)}><option value="10">10%</option><option value="15">15%</option><option value="20">20%</option><option value="25">25%</option><option value="30">30%</option><option value="40">40%</option></select></label>
   </div>
   {summary?<div className="octuber-pricing-metrics">
    <div><span>最低紀錄報價</span><strong>{money(summary.min)}</strong></div>
    <div><span>商家報價中位數</span><strong>{money(summary.median)}</strong></div>
    <div><span>最低毛利售價</span><strong>{money(summary.floorPrice)}</strong></div>
    <div><span>建議參考售價</span><strong>{summary.targetPrice===null?"資料不足":money(summary.targetPrice)}</strong></div>
   </div>:<p className="octuber-pricing-note">輸入目前售價與完全成本，才會計算限制單次 ±10% 的定價建議。建議值不會自動發布。</p>}
   <div className="octuber-pricing-table"><table><thead><tr><th>來源／商家</th><th>價格</th><th>觀察時間</th><th>證據</th></tr></thead>
    <tbody>{selectedRows.map(record=><tr key={record.id}><td>{record.source} · {record.merchant}</td><td>{money(record.price)}</td><td>{record.observedAt?new Date(record.observedAt).toLocaleString("zh-TW"):"未提供"}</td><td>{record.url?<a href={record.url} target="_blank" rel="noopener noreferrer">來源頁面</a>:"人工匯入"}</td></tr>)}</tbody>
   </table></div>
   {summary&&<p className="octuber-pricing-note">{summary.notes.join("；")}。本功能只計算參考價，不呼叫商家的商品修改 API。</p>}
  </div>}
 </section>;
}
