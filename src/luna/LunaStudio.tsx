import {useEffect,useRef,useState,type ChangeEvent,type PointerEvent as PointerEvt,type KeyboardEvent as KeyEvt} from "react";
import {ArrowDown,ArrowUp,Copy,Download,FileJson,ImagePlus,Layers,Plus,Redo2,Save,Shapes,Sparkles,Trash2,Type,Undo2,Upload} from "lucide-react";
import {LUNA_MAX_LAYERS,LUNA_MAX_PROJECTS,LUNA_PALETTE,LUNA_TEMPLATES,addLunaLayer,clamp,createLuna,duplicateLuna,lunaStorageKey,moveLuna,orderLuna,parseLuna,parseLunaLibrary,promptLuna,type LunaDoc,type LunaLayer,type LunaLibrary,type LunaTemplate} from "./model";
import {importLunaImage,lunaPNG,saveLunaFile} from "./export";
import LunaAdvancedTools from "./LunaAdvancedTools";
import "./luna.css";

function restoreLibrary(owner:string):LunaLibrary{
 try{const saved=parseLunaLibrary(JSON.parse(localStorage.getItem(lunaStorageKey(owner))||"null"));if(saved.projects.length)return saved;}catch{/* new empty workspace */}
 const doc=createLuna();return {projects:[doc],activeId:doc.id};
}
const filename=(name:string)=>name.replace(/[\\/:*?"<>|]/g,"_").slice(0,80)||"LUNA";
type Drag={id:string;initial:LunaDoc;clientX:number;clientY:number;x:number;y:number};
export default function LunaStudio({owner}:{owner:string}){
 const [library,setLibrary]=useState<LunaLibrary>(()=>restoreLibrary(owner));
 const [layerId,setLayerId]=useState<string|null>(null);
 const [prompt,setPrompt]=useState("");
 const [notice,setNotice]=useState("作品只儲存在目前裝置；不需要額外管理員帳號。");
 const [busy,setBusy]=useState(false);
 const [width,setWidth]=useState(420);
 const doc=library.projects.find(d=>d.id===library.activeId)||library.projects[0];
 const docRef=useRef(doc),drag=useRef<Drag|null>(null),history=useRef<LunaDoc[]>([]),redo=useRef<LunaDoc[]>([]);
 const stage=useRef<HTMLDivElement|null>(null),imageInput=useRef<HTMLInputElement|null>(null),jsonInput=useRef<HTMLInputElement|null>(null);
 const [,refresh]=useState(0);
 const selected=doc.layers.find(l=>l.id===layerId)||null;
 useEffect(()=>{docRef.current=doc;},[doc]);
 useEffect(()=>{const el=stage.current;if(!el||typeof ResizeObserver==="undefined")return;
  const ro=new ResizeObserver(e=>{if(e[0]?.contentRect.width)setWidth(e[0].contentRect.width);});ro.observe(el);return()=>ro.disconnect();
 },[]);
 useEffect(()=>{const task=window.setTimeout(()=>{
  try{localStorage.setItem(lunaStorageKey(owner),JSON.stringify(library));}
  catch{setNotice("本機空間不足，作品未必已儲存。請先匯出 JSON 作為備份。");}
 },500);return()=>window.clearTimeout(task);},[owner,library]);
 function edit(next:LunaDoc,record=true){
  if(record){history.current.push(docRef.current);history.current=history.current.slice(-40);redo.current=[];}
  docRef.current=next;setLibrary(s=>({...s,projects:s.projects.map(p=>p.id===next.id?next:p)}));refresh(x=>x+1);
 }
 function choose(id:string){setLibrary(s=>({...s,activeId:id}));const found=library.projects.find(p=>p.id===id);if(found)docRef.current=found;
  setLayerId(null);history.current=[];redo.current=[];refresh(x=>x+1);}
 function create(template:LunaTemplate|LunaDoc){
  if(library.projects.length>=LUNA_MAX_PROJECTS){setNotice("最多保留 15 個作品；請匯出或刪除舊作品。");return;}
  const next=typeof template==="string"?createLuna(template):template;
  setLibrary(s=>({...s,projects:[...s.projects,next],activeId:next.id}));docRef.current=next;
  setLayerId(null);history.current=[];redo.current=[];refresh(x=>x+1);setNotice("已建立新的可編輯設計。");
 }
 function deleteProject(){
  if(!window.confirm("確定刪除目前作品？本機刪除無法復原。"))return;
  const remaining=library.projects.filter(p=>p.id!==doc.id);
  if(!remaining.length)remaining.push(createLuna());
  setLibrary({projects:remaining,activeId:remaining[0].id});docRef.current=remaining[0];
  setLayerId(null);history.current=[];redo.current=[];refresh(x=>x+1);setNotice("已在此裝置移除作品。");
 }
 function undo(){const previous=history.current.pop();if(!previous)return;redo.current.push(docRef.current);edit(previous,false);}
 function redoAction(){const next=redo.current.pop();if(!next)return;history.current.push(docRef.current);edit(next,false);}
 function add(kind:LunaLayer["kind"],image?:string){
  if(doc.layers.length>=LUNA_MAX_LAYERS){setNotice("已達每張 60 個圖層上限");return;}
  const layer={...addLunaLayer(kind),...(image?{image}:{})};edit({...doc,layers:[...doc.layers,layer],updatedAt:Date.now()});setLayerId(layer.id);
 }
 function patchLayer(id:string,change:Partial<LunaLayer>){edit({...doc,layers:doc.layers.map(l=>l.id===id?{...l,...change,id:l.id,kind:l.kind}:l),updatedAt:Date.now()});}
 async function importImage(event:ChangeEvent<HTMLInputElement>){
  const file=event.currentTarget.files?.[0];event.currentTarget.value="";if(!file)return;
  try{add("image",await importLunaImage(file));setNotice("圖片已加入獨立圖層。");}catch(e){setNotice("匯入圖片失敗："+String(e instanceof Error?e.message:e));}
 }
 async function importJSON(event:ChangeEvent<HTMLInputElement>){
  const file=event.currentTarget.files?.[0];event.currentTarget.value="";if(!file)return;
  if(file.size>4_000_000)return setNotice("JSON 檔案不得大於 4 MB。");
  try{const d=parseLuna(JSON.parse(await file.text()) as unknown);create({...d,id:crypto.randomUUID(),name:d.name+"（匯入）"});}
  catch(e){setNotice("匯入失敗："+String(e instanceof Error?e.message:e));}
 }
 function saveJSON(){saveLunaFile(filename(doc.name)+".json",new Blob([JSON.stringify(doc,null,2)],{type:"application/json"}));setNotice("已輸出可再次編輯的 JSON 檔。");}
 async function savePNG(){
  setBusy(true);try{saveLunaFile(filename(doc.name)+".png",await lunaPNG(doc));setNotice("已產生 PNG；請在裝置下載項目查看。");}
  catch(e){setNotice("輸出失敗："+String(e instanceof Error?e.message:e));}finally{setBusy(false);}
 }
 function startDrag(e:PointerEvt<HTMLDivElement>,l:LunaLayer){
  if(e.pointerType==="mouse"&&e.button!==0)return;setLayerId(l.id);
  e.currentTarget.setPointerCapture(e.pointerId);
  drag.current={id:l.id,initial:docRef.current,clientX:e.clientX,clientY:e.clientY,x:l.x,y:l.y};
 }
 function moveDrag(e:PointerEvt<HTMLDivElement>){
  const d=drag.current,r=stage.current?.getBoundingClientRect();if(!d||!r)return;
  const x=d.x+(e.clientX-d.clientX)/r.width,y=d.y+(e.clientY-d.clientY)/r.height;
  edit(moveLuna(docRef.current,d.id,x,y),false);
 }
 function stopDrag(){const d=drag.current;if(!d)return;drag.current=null;
  if(d.initial!==docRef.current){history.current.push(d.initial);history.current=history.current.slice(-40);redo.current=[];refresh(x=>x+1);}
 }
 function moveKey(e:KeyEvt<HTMLDivElement>,l:LunaLayer){
  if(!["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key))return;e.preventDefault();
  const step=e.shiftKey?.02:.005;
  edit(moveLuna(docRef.current,l.id,l.x+(e.key==="ArrowLeft"?-step:e.key==="ArrowRight"?step:0),l.y+(e.key==="ArrowUp"?-step:e.key==="ArrowDown"?step:0)));
 }
 const zoom=width/doc.width;
 return <div className="luna-root">
  <header className="luna-heading"><div><small>VANILLA / DETROIT / VISUAL</small><h1>LUNA <em>STUDIO</em></h1><p>本機可編輯海報 · 品牌視覺 · 社群宣傳</p></div>
   <div className="luna-head-actions"><button onClick={undo} disabled={!history.current.length}><Undo2 size={17}/>復原</button>
    <button onClick={redoAction} disabled={!redo.current.length}><Redo2 size={17}/>重做</button>
    <button className="luna-primary" onClick={()=>void savePNG()} disabled={busy}><Download size={17}/>{busy?"輸出中":"下載 PNG"}</button></div>
  </header>
  <div className="luna-docbar"><label>作品<select value={doc.id} onChange={e=>choose(e.target.value)}>{library.projects.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
   <label>名稱<input value={doc.name} maxLength={90} onChange={e=>edit({...doc,name:e.target.value.slice(0,90)})}/></label>
   <span><Save size={14}/>本機自動儲存</span>
  </div>
  <div className="luna-layout">
   <aside className="luna-left">
    <section className="luna-panel"><h2><Sparkles size={17}/>快速構圖</h2><textarea rows={3} value={prompt} maxLength={300} placeholder="例如：醫美診所秋季品牌形象海報" onChange={e=>setPrompt(e.target.value)}/>
     <button className="luna-primary" onClick={()=>create(promptLuna(prompt))}>建立新海報</button><small>目前依關鍵字套用本機模板，不會冒充 AI 生圖。</small></section>
    <section className="luna-panel"><h2>設計模板</h2><div className="luna-templates">{LUNA_TEMPLATES.map(t=><button key={t.id} onClick={()=>create(t.id)}><span className={"luna-swatch "+t.id}/>{t.name}</button>)}</div></section>
    <section className="luna-panel"><h2><Plus size={17}/>新增元素</h2><div className="luna-insert">
     <button onClick={()=>add("text")}><Type size={17}/>文字</button><button onClick={()=>add("shape")}><Shapes size={17}/>色塊</button><button onClick={()=>imageInput.current?.click()}><ImagePlus size={17}/>圖片</button></div>
     <input type="file" hidden ref={imageInput} accept="image/png,image/jpeg,image/webp" onChange={e=>void importImage(e)}/></section>
    <LunaAdvancedTools doc={doc} selected={selected} onCreate={newDoc=>create(newDoc)} onReplaceImage={(id,image)=>patchLayer(id,{image,fill:"#FFFFFF"})} onNotice={setNotice}/>
   </aside>
   <section className="luna-workspace" aria-label="LUNA 可編輯畫布">
    <div className="luna-canvas-box"><div className="luna-canvas" ref={stage} style={{aspectRatio:String(doc.width)+"/"+String(doc.height),background:doc.background}} onClick={()=>setLayerId(null)}>
     {doc.layers.map(l=><div key={l.id} role="button" tabIndex={0} aria-label={l.label+"，方向鍵可移動圖層"} className={"luna-layer "+(layerId===l.id?"active":"")}
      style={{left:(100*l.x)+"%",top:(100*l.y)+"%",width:(100*l.w)+"%",height:(100*l.h)+"%",opacity:l.opacity,
       ...(l.kind==="shape"?{background:l.fill,borderRadius:(l.radius||0)+"%"}:{}),
       ...(l.kind==="image"?{background:l.image?"url("+l.image+") center/cover no-repeat":l.fill,borderRadius:(l.radius||0)+"%"}:{}),
       ...(l.kind==="text"?{color:l.color,fontSize:(l.fontSize||65)*zoom,fontWeight:l.fontWeight||700,textAlign:l.align||"left"}:{})}}
      onClick={e=>{e.stopPropagation();setLayerId(l.id);}} onPointerDown={e=>startDrag(e,l)} onPointerMove={moveDrag} onPointerUp={stopDrag} onPointerCancel={stopDrag} onKeyDown={e=>moveKey(e,l)}>
       {l.kind==="text"?l.text:l.kind==="image"&&!l.image?"圖片圖層":null}
      </div>)}
    </div></div><p className="luna-canvas-note">{doc.width} × {doc.height} px · 點選、拖曳圖層即可移動</p>
    <div className="luna-exports"><button onClick={saveJSON}><FileJson size={16}/>匯出 JSON</button>
     <button onClick={()=>jsonInput.current?.click()}><Upload size={16}/>匯入 JSON</button>
     <button className="danger" onClick={deleteProject}><Trash2 size={16}/>刪除作品</button>
     <input type="file" hidden ref={jsonInput} accept=".json,application/json" onChange={e=>void importJSON(e)}/></div>
   </section>
   <aside className="luna-right">
    <section className="luna-panel"><h2><Layers size={17}/>圖層 <small>{doc.layers.length}/{LUNA_MAX_LAYERS}</small></h2><div className="luna-layers">{[...doc.layers].reverse().map(l=><button className={l.id===layerId?"active":""} key={l.id} onClick={()=>setLayerId(l.id)}>{l.kind==="text"?"T":l.kind==="image"?"▧":"■"}　{l.label}</button>)}</div></section>
    <section className="luna-panel"><h2>屬性調整</h2>{selected?<div className="luna-properties" key={selected.id}>
     <label>圖層名稱<input value={selected.label} maxLength={70} onChange={e=>patchLayer(selected.id,{label:e.target.value})}/></label>
     {selected.kind==="text"&&<><label>文字<textarea rows={4} value={selected.text||""} maxLength={2000} onChange={e=>patchLayer(selected.id,{text:e.target.value})}/></label>
      <label>字級<input type="number" value={selected.fontSize||65} min={12} max={300} onChange={e=>patchLayer(selected.id,{fontSize:clamp(Number(e.target.value)||12,12,300)})}/></label>
      <label>字重<select value={selected.fontWeight||700} onChange={e=>patchLayer(selected.id,{fontWeight:Number(e.target.value)})}><option value={400}>一般</option><option value={600}>半粗</option><option value={700}>粗體</option><option value={900}>極粗</option></select></label>
      <label>對齊<select value={selected.align||"left"} onChange={e=>patchLayer(selected.id,{align:e.target.value as "left"|"center"|"right"})}><option value="left">靠左</option><option value="center">置中</option><option value="right">靠右</option></select></label>
     </>}
     <label>{selected.kind==="text"?"文字顏色":"填色"}<input type="color" value={selected.kind==="text"?selected.color:selected.fill} onChange={e=>patchLayer(selected.id,selected.kind==="text"?{color:e.target.value}:{fill:e.target.value})}/></label>
     <label>透明度：{Math.round(selected.opacity*100)}%<input type="range" min={0} max={100} value={selected.opacity*100} onChange={e=>patchLayer(selected.id,{opacity:Number(e.target.value)/100})}/></label>
     <div className="luna-dimensions"><label>寬度 %<input type="number" value={Math.round(selected.w*100)} min={1} max={100} onChange={e=>patchLayer(selected.id,{w:clamp((Number(e.target.value)||1)/100,.002,1-selected.x)})}/></label>
      <label>高度 %<input type="number" value={Math.round(selected.h*100)} min={1} max={100} onChange={e=>patchLayer(selected.id,{h:clamp((Number(e.target.value)||1)/100,.002,1-selected.y)})}/></label></div>
     <div className="luna-layer-actions"><button title="上一層" onClick={()=>edit(orderLuna(doc,selected.id,1))}><ArrowUp size={17}/></button><button title="下一層" onClick={()=>edit(orderLuna(doc,selected.id,-1))}><ArrowDown size={17}/></button>
      <button title="複製" onClick={()=>edit(duplicateLuna(doc,selected.id))}><Copy size={17}/></button>
      <button title="刪除" onClick={()=>{edit({...doc,layers:doc.layers.filter(l=>l.id!==selected.id)});setLayerId(null);}}><Trash2 size={17}/></button></div>
    </div>:<p className="luna-hint">點選任一圖層，編輯文字與外觀。</p>}</section>
    <section className="luna-panel"><h2>畫布</h2><label>背景顏色<input type="color" value={doc.background} onChange={e=>edit({...doc,background:e.target.value})}/></label>
     <div className="luna-palette">{LUNA_PALETTE.map(c=><button key={c} title={c} style={{background:c}} onClick={()=>edit({...doc,background:c})}/>)}</div></section>
   </aside>
  </div>
  <p className="luna-status" role="status">{notice}</p>
  <footer className="luna-footer">LUNA 為 Vanilla 原生獨立模組；沒有沿用迅排的後端、管理員帳號或 API。只有明確同意的 AI 排版需求會傳送到已連接的模型服務；去背需要下載公開模型檔。作品及圖片編輯均在本機。共用裝置上的本機資料仍須自行保護。</footer>
 </div>;
}
