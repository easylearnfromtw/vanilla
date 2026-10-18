import {useEffect,useState} from "react";
import {MessageSquareText,RotateCcw,ShieldCheck,SlidersHorizontal} from "lucide-react";
import {getToneProfile,getToneSummary,resetToneProfile,saveToneProfile,type ToneProfile} from "./tone-adaptation";
export default function ToneSettings(){
 const [profile,setProfile]=useState<ToneProfile>(getToneProfile);
 useEffect(()=>{const update=()=>setProfile(getToneProfile());window.addEventListener("vanilla-tone-changed",update);return()=>window.removeEventListener("vanilla-tone-changed",update);},[]);
 function patch(updates:Partial<ToneProfile>){saveToneProfile({...profile,...updates});setProfile(getToneProfile());}
 return <section className="tone-settings">
  <header className="tone-heading"><span className="tone-heading-icon"><MessageSquareText size={20}/></span><div><h3>對話同頻 · 語氣適應</h3><p>Vanilla 逐步學會你偏好的回覆節奏；只調整語氣與呈現方式，不改變事實標準。</p></div></header>
  <label className="tone-toggle"><input type="checkbox" checked={profile.enabled} onChange={e=>patch({enabled:e.target.checked})}/><span>啟用自動語氣適應</span></label>
  <p className="tone-summary">{getToneSummary(profile)}</p>
  <label className="tone-label" htmlFor="tone-strength">模仿程度</label>
  <select id="tone-strength" value={profile.strength} disabled={!profile.enabled} onChange={e=>patch({strength:e.target.value as ToneProfile["strength"]})}>
   <option value="light">輕度：保持 Vanilla 原有語氣</option>
   <option value="balanced">自然：貼近你的溝通節奏</option>
   <option value="close">接近：更像你平常的表達方式</option>
  </select>
  <div className="tone-sliders">
   {([
    {key:"directness",label:"直接程度",left:"較委婉",right:"先講重點"},
    {key:"warmth",label:"親近感",left:"理性俐落",right:"自然親切"},
    {key:"detail",label:"回覆長度",left:"精簡",right:"詳細"}
   ] as const).map(option=><label key={option.key}>
    <span>{option.label}<strong>{profile[option.key]}%</strong></span>
    <input disabled={!profile.enabled} type="range" min={0} max={100} step={5} value={profile[option.key]} onChange={e=>patch({[option.key]:Number(e.target.value)})}/>
    <small><em>{option.left}</em><em>{option.right}</em></small>
   </label>)}
  </div>
  <div className="tone-privacy"><ShieldCheck size={17}/><span>僅保存訊息長度、標點比例等統計，不保存你說過的原文。私密模式不加入學習。使用 Ollama／Gemini 時，只有語氣指引隨模型要求傳送，原始聊天的傳輸仍依既有模式設定。</span></div>
  <button type="button" className="tone-reset" onClick={()=>{if(window.confirm("確定清除 Vanilla 在這台裝置學到的語氣偏好？")){resetToneProfile();setProfile(getToneProfile());}}}><RotateCcw size={15}/>清除已學習的風格</button>
 </section>;
}
