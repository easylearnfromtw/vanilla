import {useEffect,useRef,useState,type ReactNode} from "react";
import {ChevronLeft,ChevronRight} from "lucide-react";

export type SwipeItem={id:string;label:string;node:ReactNode};
import {visibleSwipeIndex} from "./swipe-utils";
export default function SwipeDeck({items,label}:{items:SwipeItem[];label:string}){
 const ref=useRef<HTMLDivElement>(null);
 const [index,setIndex]=useState(0);
 const [mobile,setMobile]=useState(()=>typeof window!=="undefined"&&window.matchMedia("(max-width: 760px)").matches);
 useEffect(()=>{
  const query=window.matchMedia("(max-width: 760px)");
  const update=()=>setMobile(query.matches);
  update();query.addEventListener("change",update);
  return()=>query.removeEventListener("change",update);
 },[]);
 useEffect(()=>{setIndex(0);ref.current?.scrollTo({left:0,behavior:"auto"});},[items.map(x=>x.id).join("|")]);
 if(!items.length)return null;
 if(items.length===1)return <div className="swipe-single">{items[0].node}</div>;
 const maxStart=Math.max(0,items.length-(mobile?1:2));
 const move=(n:number)=>{
  const target=Math.max(0,Math.min(maxStart,n));
  const frame=ref.current,child=frame?.children.item(target) as HTMLElement|null;
  if(frame&&child){
   const left=child.offsetLeft-(frame.children.item(0) as HTMLElement).offsetLeft;
   frame.scrollTo({left,behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"});
  }
  setIndex(target);
 };
 const onScroll=()=>{
  const frame=ref.current;if(!frame)return;
  const origin=(frame.children.item(0) as HTMLElement|null)?.offsetLeft||0;
  const offsets=[...frame.children].map(node=>(node as HTMLElement).offsetLeft-origin);
  setIndex(Math.min(maxStart,visibleSwipeIndex(frame.scrollLeft,offsets)));
 };
 return <section className="swipe-deck" data-count={items.length} aria-label={label}>
  <div className="swipe-topline">
   <span>{label} <small>· {mobile?"向左右滑動查看":"並排比較，也可切換"} </small></span>
   <div className="swipe-actions">
    <button type="button" aria-label={"上一張"+label} disabled={index<=0} onClick={()=>move(index-1)}><ChevronLeft size={17}/></button>
    <span aria-live="polite">{index+1}{!mobile&&items.length>1?"–"+Math.min(index+2,items.length):""} / {items.length}</span>
    <button type="button" aria-label={"下一張"+label} disabled={index>=maxStart} onClick={()=>move(index+1)}><ChevronRight size={17}/></button>
   </div>
  </div>
  <div className="swipe-track" ref={ref} onScroll={onScroll} tabIndex={0} aria-label={"可橫向滑動："+label}>
   {items.map((item,i)=><article key={item.id} className="swipe-panel" aria-label={item.label} style={{scrollSnapAlign:i>=maxStart?"end":"start"}}>
    <div className="swipe-panel-label">{item.label}</div>{item.node}
   </article>)}
  </div>
  <div className="swipe-dots" aria-hidden="true">{items.map((item,i)=><span key={item.id} className={i>=index&&i<index+(mobile?1:2)?"active":""}/>)}</div>
 </section>;
}
