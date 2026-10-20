import type {ReactNode} from "react";
import {Download} from "lucide-react";
import type {ArchiveSummary} from "../library/conversation-archive";

const BASE=import.meta.env.BASE_URL;
export type HomeStatus={canReply:boolean;webgpu:boolean;loading:boolean;progress:number;privateMode:boolean;cachedLocal:boolean|null;localLabel:string;localSizeMB:number};
/** Empty-chat home, modelled on the Vanilla key-visual phone screen:
 * mark → wordmark → input → tools; recent conversations are in the sidebar. */
export default function ChatHome(props:{
 composer:ReactNode;status:HomeStatus;recent:ArchiveSummary[];busy:boolean;
 onFocusComposer:()=>void;onPrefill:(text:string)=>void;
 onOpenSection:(section:"library"|"settings"|"cream")=>void;
 onReopen:(id:string)=>void;onLoadLocal:()=>void;
}){
 const {status}=props;
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

  <p className="vh-tagline">直接描述任務，Detroit 會在對話中自動選擇可用能力。</p>



 </div>;
}
