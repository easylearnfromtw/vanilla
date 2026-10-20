import {createElement,useEffect,useState,type ReactNode} from "react";
import type {VenusBlock} from "./presentation";
import {parseVenusMath,type MathNode} from "./math-core";

type MapBlock=Extract<VenusBlock,{kind:"map"}>;
type VideoBlock=Extract<VenusBlock,{kind:"video"}>;
type MathBlock=Extract<VenusBlock,{kind:"math"}>;
type LiveBlock=Extract<VenusBlock,{kind:"live"}>;
function Title({title}:{title:string}){return title?<h3 className="venus-title">{title}</h3>:null;}

/** React 18's JSX intrinsic typings omit MathML tags. React.createElement safely
 * constructs fixed, allowlisted MathML tags without HTML injection or type widening.
 */
function renderMath(node:MathNode,key=0):ReactNode{
 switch(node.kind){
 case "token":return createElement(node.role,{key},node.text);
 case "row":return createElement("mrow",{key},...node.items.map((part,i)=>renderMath(part,i)));
 case "fraction":return createElement("mfrac",{key},renderMath(node.numerator),renderMath(node.denominator));
 case "sqrt":return createElement("msqrt",{key},renderMath(node.content));
 case "script":
  if(node.sup&&node.sub)return createElement("msubsup",{key},renderMath(node.base),renderMath(node.sub),renderMath(node.sup));
  if(node.sup)return createElement("msup",{key},renderMath(node.base),renderMath(node.sup));
  return createElement("msub",{key},renderMath(node.base),node.sub?renderMath(node.sub):createElement("mrow"));
 }
}
export function VenusMath({block}:{block:MathBlock}){
 const ast=parseVenusMath(block.expression);
 return <section className="venus-widget venus-math"><Title title={block.title}/>
  {ast?<div className="venus-math-scroll" aria-label={"數學公式："+block.expression}>
   {createElement("math",{xmlns:"http://www.w3.org/1998/Math/MathML",display:"block"},renderMath(ast))}
  </div>:<p className="venus-math-fallback"><code>{block.expression}</code><small>此公式含尚未支援的符號，保留原始 LaTeX，避免顯示錯誤公式。</small></p>}
 </section>;
}
/** Interactive position chooser; real OSM tiles and marker load only after affirmative click. */
export function VenusMap({block}:{block:MapBlock}){
 const [selected,setSelected]=useState(0),[permitted,setPermitted]=useState(false);
 const pin=block.points[Math.min(selected,block.points.length-1)];
 const lat=pin.lat,lon=pin.lon,delta=.012;
 const bbox=[Math.max(-180,lon-delta),Math.max(-85,lat-delta),Math.min(180,lon+delta),Math.min(85,lat+delta)].join(",");
 const embed="https://www.openstreetmap.org/export/embed.html?bbox="+encodeURIComponent(bbox)+"&layer=mapnik&marker="+encodeURIComponent(lat+","+lon);
 const open="https://www.openstreetmap.org/?mlat="+lat+"&mlon="+lon+"#map=14/"+lat+"/"+lon;
 return <section className="venus-widget venus-map"><Title title={block.title}/>
  <div className="venus-point-picker" aria-label="選擇地圖地點">
  {block.points.map((p,i)=><button type="button" key={i} aria-pressed={selected===i} className={selected===i?"selected":""} onClick={()=>{setSelected(i);setPermitted(false);}}>{p.label}</button>)}
  </div>
  <p className="venus-map-position"><strong>{pin.label}</strong>{pin.description&&" · "+pin.description}<small>座標（由回答提供，尚未獨立核對）：{lat.toFixed(5)}, {lon.toFixed(5)}</small></p>
  {permitted?<iframe title={"OpenStreetMap："+pin.label} className="venus-map-frame" src={embed} loading="lazy" referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin" />:
  <button type="button" className="venus-external-consent" onClick={()=>setPermitted(true)}>載入 OpenStreetMap 互動地圖</button>}
  <div className="venus-linkline"><a href={open} rel="noopener noreferrer" target="_blank">在 OpenStreetMap 檢視這個位置 ↗</a></div>
  <p className="venus-muted">地圖會向 OpenStreetMap 連線；僅在按下載入後顯示。可切換地點，不提供未經驗證的路程／行車時間。</p>
 </section>;
}
export function VenusVideo({block}:{block:VideoBlock}){
 const [permitted,setPermitted]=useState(false);
 const url=block.provider==="youtube"?"https://www.youtube-nocookie.com/embed/"+block.videoId:"https://player.vimeo.com/video/"+block.videoId;
 const external=block.provider==="youtube"?"https://www.youtube.com/watch?v="+block.videoId:"https://vimeo.com/"+block.videoId;
 return <section className="venus-widget venus-video"><Title title={block.title}/>
  {permitted?<iframe className="venus-video-frame" title={block.title} src={url} loading="lazy"
   allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen
   sandbox="allow-scripts allow-same-origin allow-presentation" referrerPolicy="no-referrer"/>:
   <button type="button" className="venus-external-consent" onClick={()=>setPermitted(true)}>▶ 載入 {block.provider==="youtube"?"YouTube":"Vimeo"} 影片播放器</button>}
  {block.caption&&<p className="venus-muted">{block.caption}</p>}
  <div className="venus-linkline"><a href={external} rel="noopener noreferrer" target="_blank">在影片網站檢視 ↗</a></div>
  <p className="venus-muted">第三方播放器須點擊才連線。影片 ID 來自回答，並不代表已確認影片存在。</p>
 </section>;
}
export function VenusLive({block}:{block:LiveBlock}){
 const [now,setNow]=useState(()=>Date.now());
 useEffect(()=>{const interval=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(interval);},[]);
 let value="";
 if(block.mode==="clock"){
  value=new Intl.DateTimeFormat("zh-TW",{timeZone:block.timezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(now);
 }else{
  const remaining=Math.max(0,Date.parse(block.targetISO)-now),seconds=Math.floor(remaining/1000);
  const days=Math.floor(seconds/86400),hours=Math.floor(seconds%86400/3600),minutes=Math.floor(seconds%3600/60);
  value=remaining===0?"倒數已結束":(days?days+" 天 ":"")+[hours,minutes,seconds%60].map(x=>String(x).padStart(2,"0")).join(":");
 }
 return <section className="venus-widget venus-live"><Title title={block.title}/>
  <div className="venus-live-value" role="timer">{value}</div>
  <p className="venus-muted">{block.mode==="clock"?"時區："+block.timezone:"目標："+block.targetISO} · 使用本裝置時間更新（非第三方即時資料）</p>
 </section>;
}
