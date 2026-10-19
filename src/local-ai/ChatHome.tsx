import type {ReactNode} from "react";
import {MessageCircle,Search,WandSparkles,FolderOpen,Download} from "lucide-react";

const BASE=import.meta.env.BASE_URL;
export type HomeStatus={canReply:boolean;webgpu:boolean;loading:boolean;progress:number;privateMode:boolean;cachedLocal:boolean|null;localLabel:string;localSizeMB:number};
/** Empty-chat home, modelled on the Vanilla key-visual phone screen:
 * mark → wordmark → input → four tools. Recent conversations live in the sidebar only. */
export default function ChatHome(props:{
 composer:ReactNode;status:HomeStatus;busy:boolean;
 onFocusComposer:()=>void;onPrefill:(text:string)=>void;
 onOpenSection:(section:"library"|"settings"|"cream")=>void;
 onLoadLocal:()=>void;
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

 </div>;
}
