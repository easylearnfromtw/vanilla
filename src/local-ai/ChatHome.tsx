import type {ReactNode} from "react";
import {MessageCircle,Search,WandSparkles,FolderOpen,ChevronRight,Download} from "lucide-react";
import type {ArchiveSummary} from "../library/conversation-archive";

const BASE=import.meta.env.BASE_URL;
export type HomeStatus={canReply:boolean;webgpu:boolean;loading:boolean;progress:number;privateMode:boolean;cachedLocal:boolean|null;localLabel:string;localSizeMB:number};
function ago(ms:number):string{
 const m=Math.max(1,Math.round((Date.now()-ms)/60000));
 if(m<60)return m+" 分鐘前";
 const h=Math.round(m/60);if(h<24)return h+" 小時前";
 const d=Math.round(h/24);return d<30?d+" 天前":new Date(ms).toLocaleDateString("zh-TW");
}
/** Empty-chat home, modelled on the Vanilla key-visual phone screen:
 * mark → wordmark → input → four tools → recent. Nothing else. */
export default function ChatHome(props:{
 composer:ReactNode;status:HomeStatus;recent:ArchiveSummary[];busy:boolean;
 onFocusComposer:()=>void;onPrefill:(text:string)=>void;
 onOpenSection:(section:"library"|"settings"|"cream")=>void;
 onReopen:(id:string)=>void;onLoadLocal:()=>void;
}){
 const {status}=props;
 const tiles=[
  {id:"chat",label:"對話",icon:MessageCircle,run:props.onFocusComposer},
  {id:"research",label:"研究",icon:Search,run:()=>props.onPrefill("/搜尋 ")},
  {id:"create",label:"建立",icon:WandSparkles,run:()=>props.onPrefill("/建立 ")},
  {id:"organize",label:"整理",icon:FolderOpen,run:()=>props.onOpenSection("library")}
 ] as const;
 return <div className="vh-home">
  <div className="vh-hero vh-reveal">
   <img className="vh-mark" src={BASE+"brand/vanilla-mark.webp"} alt="" width={900} height={769} decoding="async"/>
   <h2 className="vh-wordmark">VANILLA AI</h2>
   <p className="vh-tagline">A MORE HUMAN AI</p>
  </div>

  <div className="vh-home-composer vh-reveal">{props.composer}</div>

  {!status.canReply&&<div className="vh-status vh-reveal" role="status">
   <span>{status.loading?"正在準備本地模型 "+status.progress+"%":status.privateMode?"私密模式需要手機本地模型":"還沒有可以回答的模型"}</span>
   {status.webgpu&&!status.loading?<button type="button" onClick={props.onLoadLocal}><Download size={13}/>{status.cachedLocal?"載入本機模型":"下載本機模型（約 "+(status.localSizeMB/1000).toFixed(1)+" GB）"}</button>:
    !status.privateMode&&!status.loading?<button type="button" onClick={()=>props.onOpenSection("settings")}>連接雲端模型</button>:null}
  </div>}

  <div className="vh-tiles vh-reveal" role="group" aria-label="主要工具">
   {tiles.map(t=><button key={t.id} type="button" className="vh-tile" disabled={props.busy&&t.id!=="organize"} onClick={t.run}>
    <t.icon size={22} strokeWidth={1.6}/><span>{t.label}</span>
   </button>)}
  </div>

  {props.recent.length>0&&<section className="vh-recent vh-reveal" aria-label="最近的對話">
   <div className="vh-section-label">RECENT</div>
   <ul>{props.recent.slice(0,4).map(item=><li key={item.id}>
    <button type="button" onClick={()=>props.onReopen(item.id)}>
     <span className="vh-recent-text"><strong>{item.title}</strong><small>{item.turnCount} 則 · {ago(item.updatedAt)}</small></span>
     <ChevronRight size={16} className="vh-recent-chevron"/>
    </button>
   </li>)}</ul>
  </section>}
 </div>;
}
