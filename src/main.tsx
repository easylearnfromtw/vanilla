import React from "react";
import {createRoot} from "react-dom/client";
import App from "./App";
import "./style.css";

type State={error:string|null};
class AppErrorBoundary extends React.Component<React.PropsWithChildren,State>{
  state:State={error:null};
  static getDerivedStateFromError(error:Error):State{return {error:error.message||"未知錯誤"};}
  componentDidCatch(error:Error,info:React.ErrorInfo){console.error("Vanilla UI crashed",error,info);}
  render(){
    if(this.state.error)return <div style={{fontFamily:"-apple-system,sans-serif",padding:28,maxWidth:520,margin:"60px auto",color:"#222"}}>
      <h1>Vanilla 無法載入</h1><p>介面發生錯誤，請重新整理。若問題持續，請將下方錯誤訊息提供給開發者。</p>
      <pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",background:"#f5f5f5",padding:14,borderRadius:10}}>{this.state.error}</pre>
      <button onClick={()=>location.reload()} style={{padding:"12px 18px",borderRadius:10}}>重新載入</button>
    </div>;
    return this.props.children;
  }
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><AppErrorBoundary><App/></AppErrorBoundary></React.StrictMode>);
