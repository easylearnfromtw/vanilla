import {useState} from "react";
import {Disc3,Music2,Play,Pause,ExternalLink,Search,Headphones} from "lucide-react";
import type {CitymusSearchResult} from "./citymus";
import "./citymus.css";

export default function CitymusResults({result,onSearch}:{result:CitymusSearchResult;onSearch?:(q:string)=>void}){
 const [playing,setPlaying]=useState<string|null>(null);
 const {tracks}=result;
 return <section className="cm-results" aria-label="CITYMUS 音樂搜尋結果">
  <header className="cm-results-header">
   <div className="cm-brand"><span className="cm-brand-disc"><Disc3 size={17}/></span><div><strong>CITYMUS</strong><small>VANILLA × MUSIC DISCOVERY</small></div></div>
   <span className="cm-result-tag"><span className="cm-live-dot"/>授權曲庫</span>
  </header>
  <div className="cm-intro">
   <h3>{tracks.length?result.fallback?"為你探索 CITYMUS 音樂":"找到這些 CITYMUS 曲目":"CITYMUS 暫無符合曲目"}</h3>
   <p>{tracks.length?"顯示 "+tracks.length+" 首真實曲目 · "+(result.via==="api"?"CITYMUS 搜尋 API":"CITYMUS 公開曲庫")
    :"沒有符合「"+result.query+"」的曲目。這不表示歌曲不存在，只代表目前授權曲庫沒有匹配資料。"}</p>
  </div>
  {tracks.length>0&&<div className="cm-track-list">
   {tracks.map((t,index)=><article key={t.id+"-"+index} className="cm-track">
    <div className={"cm-art cm-art-"+(index%5)} aria-hidden="true"><span className="cm-art-ring"/><Music2 size={18}/></div>
    <div className="cm-track-detail">
     <strong title={t.title}>{t.title}</strong>
     <span title={t.artist}>{t.artist}</span>
     <small>{t.genre||t.album||"CITYMUS 音樂典藏"}{t.license&&<em> · {t.license}</em>}</small>
    </div>
    <div className="cm-track-actions">
     {t.audioUrl&&<button type="button" className="cm-play" onClick={()=>setPlaying(v=>v===t.id?null:t.id)} aria-label={(playing===t.id?"關閉試聽 ":"試聽 ")+t.title} title="開啟試聽">{playing===t.id?<Pause size={16}/>:<Play size={16}/>}</button>}
     {t.sourceUrl&&<a className="cm-source" href={t.sourceUrl} target="_blank" rel="noopener noreferrer" title={"查看 "+t.title+" 的來源"} aria-label={"開啟 "+t.title+" 原始來源"}><ExternalLink size={16}/></a>}
    </div>
    {t.audioUrl&&playing===t.id&&<div className="cm-inline-player"><audio key={t.audioUrl} controls preload="none" src={t.audioUrl} aria-label={"試聽 "+t.title}>瀏覽器不支援音訊播放。</audio><small>播放可用性依來源網站及授權條件而定。</small></div>}
   </article>)}
  </div>}
  <div className="cm-explore">
   <div className="cm-explore-label"><Headphones size={14}/> 延伸探索</div>
   <div className="cm-chips">
    {["推薦爵士音樂","推薦讀書音樂","推薦開車音樂","推薦放鬆音樂"].map(q=>
      <button type="button" key={q} onClick={()=>onSearch?.(q)} disabled={!onSearch}><Search size={12}/>{q.replace("推薦","")}</button>)}
   </div>
  </div>
  <footer className="cm-credit">
   <span>曲目資料來自 CITYMUS · 請以原始授權資訊為準</span>
   <a href={result.attribution.url} target="_blank" rel="noopener noreferrer">{result.attribution.label} <ExternalLink size={12}/></a>
  </footer>
 </section>;
}
