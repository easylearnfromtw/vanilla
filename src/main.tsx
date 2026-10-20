import React,{useEffect} from "react";
declare global {interface Window {__vanillaBootOk?:()=>void;__vanillaBootError?:(reason:string)=>void;}}
import {createRoot} from "react-dom/client";
import App from "./App";
import {VANILLA_BUILD} from "./version";
import {installClientFaultListeners,recordClientFault} from "./luca/client-diagnostics";
import {installViewportHandling,requestPersistentStorage} from "./pwa/ios-viewport";
import "./style.css";
import "./local-ai/chatgpt-layout.css";
import "./local-ai/compact-shell.css";
import "./theme/vanilla-bauhaus.css";

try{document.documentElement.dataset.fontMode=localStorage.getItem("vanilla.font.mode")||"auto";}catch{document.documentElement.dataset.fontMode="auto";}
installViewportHandling();
installClientFaultListeners();

type State={error:string|null};
class AppErrorBoundary extends React.Component<React.PropsWithChildren,State>{
  state:State={error:null};
  static getDerivedStateFromError(error:Error):State{return {error:error.message||"未知錯誤"};}
  componentDidCatch(error:Error,info:React.ErrorInfo){window.__vanillaBootOk?.();recordClientFault("ui","render",error);console.error("Vanilla UI crashed",error,info);}
  render(){
    if(this.state.error)return <div className="vh-crash">
      <h1>Vanilla 無法載入</h1><p>介面發生錯誤，請重新整理。若問題持續，請將下方錯誤訊息提供給開發者。</p>
      <pre>{this.state.error}</pre>
      <button onClick={()=>location.reload()}>重新載入</button>
    </div>;
    return this.props.children;
  }
}
function BootReady(){useEffect(()=>{
 window.__vanillaBootOk?.();
 // Build-versioned worker: each deploy gets its own shell cache and old chunks are removed.
 if("serviceWorker" in navigator){void navigator.serviceWorker.register(import.meta.env.BASE_URL+"sw.js?v="+encodeURIComponent(VANILLA_BUILD)).catch(error=>console.warn("Vanilla 離線快取暫不可用",error));}
 // Ask Safari/Chrome not to evict on-device chats, CREAM history and attachments.
 window.setTimeout(()=>{void requestPersistentStorage();},2500);
},[]);return <App/>;}
createRoot(document.getElementById("root")!).render(<React.StrictMode><AppErrorBoundary><BootReady/></AppErrorBoundary></React.StrictMode>);
