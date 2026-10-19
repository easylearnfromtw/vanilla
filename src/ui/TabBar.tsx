import {useRef,useState,type PointerEvent as RPointerEvent,type ComponentType} from "react";

export type TabItem={id:string;label:string;icon:ComponentType<{size?:number;strokeWidth?:number}>};
/** Floating Liquid Glass tab bar (phones only).
 * Tap a tab, or press and drag the glass capsule across tabs and release to switch —
 * the same gesture as iOS. The capsule swells while pressed and the tab under it magnifies. */
export default function TabBar({items,active,onSelect,compact}:{items:TabItem[];active:string;onSelect:(id:string)=>void;compact:boolean}){
 const barRef=useRef<HTMLElement|null>(null);
 const startX=useRef(0),dragging=useRef(false),suppressClick=useRef(false);
 const [dragX,setDragX]=useState<number|null>(null);
 const [pressed,setPressed]=useState(false);
 const n=items.length;
 const found=items.findIndex(x=>x.id===active);
 const index=Math.max(0,found);
 const geometry=()=>{const r=barRef.current!.getBoundingClientRect();const pad=5;return {r,pad,w:(r.width-pad*2)/n};};
 const indexAt=(clientX:number)=>{const {r,pad,w}=geometry();return Math.min(n-1,Math.max(0,Math.floor((clientX-r.left-pad)/w)));};
 const hover=dragX===null?index:(()=>{const {w}=geometry();return Math.min(n-1,Math.max(0,Math.round(dragX/w)));})();
 function down(e:RPointerEvent<HTMLElement>){startX.current=e.clientX;dragging.current=false;setPressed(true);}
 function move(e:RPointerEvent<HTMLElement>){
  if(!pressed)return;
  if(!dragging.current&&Math.abs(e.clientX-startX.current)<8)return;
  dragging.current=true;
  const {r,pad,w}=geometry();
  setDragX(Math.min((n-1)*w,Math.max(0,e.clientX-r.left-pad-w/2)));
 }
 function up(e:RPointerEvent<HTMLElement>){
  setPressed(false);
  if(dragging.current){suppressClick.current=true;onSelect(items[indexAt(e.clientX)].id);}
  dragging.current=false;setDragX(null);
 }
 return <nav ref={el=>{barRef.current=el;}} className={"vh-tabbar"+(found<0?" no-active":"")+(compact?" is-compact":"")+(pressed?" is-pressed":"")+(dragX!==null?" is-dragging":"")}
  style={{["--n" as string]:n,["--i" as string]:index}} aria-label="主要分頁"
  onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={()=>{setPressed(false);dragging.current=false;setDragX(null);}}>
  <span className="vh-tab-capsule" aria-hidden="true" style={dragX!==null?{transform:"translateX("+dragX+"px)"}:undefined}/>
  {items.map((item,i)=><button key={item.id} type="button" className={"vh-tab"+(i===found?" is-active":"")+(i===hover?" is-under":"")}
   aria-current={i===found?"page":undefined}
   onClick={()=>{if(suppressClick.current){suppressClick.current=false;return;}onSelect(item.id);}}>
   <span className="vh-tab-icon"><item.icon size={21} strokeWidth={1.9}/></span>
   <span className="vh-tab-label">{item.label}</span>
  </button>)}
 </nav>;
}
