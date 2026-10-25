import {useEffect,useMemo,useState} from "react";
import {ROTATION_PLANES,PENTERACT_VERTICES,PENTERACT_EDGES,project5D,
 planPenteractFunnel,embedFiveSpace,FIVE_EXPERTS,type RotationPlane} from "./penteract-5d";
import {cameraProject3D,DEFAULT_ORBIT_CAMERA,type OrbitCamera} from "./penteract-camera";
import {sectionPenteract5D,type FiveSlice} from "./penteract-section";
import {shadowPenteractRoute} from "./penteract-shadow";
import {routeLearnedFive,assertLearnedFiveWeights,type LearnedFiveWeights} from "./penteract-learned";
import {verifySyntheticFiveDBundle,type VerifiedSyntheticFiveDReceipt} from "./penteract-sandbox-receipt";
import {activateAtuberFiveDSandbox,clearAtuberFiveDSandbox,atuberFiveDSandboxActive} from "./atuber-5d-sandbox-bridge";
import {latestOctoberFunnelObservation,subscribeOctoberFunnelObservation} from "./penteract-telemetry";
import "./penteract-5d.css";

const INITIAL="比較兩項投資的現金流與 NPV，指出假設和風險。";
const FUNNEL_HEIGHT=78;
const WIDTH=[0.95,0.76,0.59,0.44,0.32,0.23];

export default function PenteractFunnelPanel(){
 const [text,setText]=useState(INITIAL);
 const [plane,setPlane]=useState<RotationPlane>("xw");
 const [angle,setAngle]=useState(0.42);
 const [showAll,setShowAll]=useState(false);
 const [showSlice,setShowSlice]=useState(false);
 const [learnedArtifact,setLearnedArtifact]=useState<LearnedFiveWeights|null>(null);
 const [learnedArtifactRaw,setLearnedArtifactRaw]=useState("");
 const [verifiedReceipt,setVerifiedReceipt]=useState<VerifiedSyntheticFiveDReceipt|null>(null);
 const [learnedError,setLearnedError]=useState("");
 const [atuberBridgeEnabled,setAtuberBridgeEnabled]=useState(false);
 const [slice,setSlice]=useState<FiveSlice>({w:0,v:0});
 const [orbit,setOrbit]=useState<OrbitCamera>({...DEFAULT_ORBIT_CAMERA});
 const [measured,setMeasured]=useState(latestOctoberFunnelObservation);
 useEffect(()=>subscribeOctoberFunnelObservation(setMeasured),[]);
 const plan=useMemo(()=>planPenteractFunnel(text,{privateMode:true}),[text]);
 const shadow=useMemo(()=>shadowPenteractRoute(text),[text]);
 const learnedPreview=useMemo(()=>learnedArtifact?routeLearnedFive(text,learnedArtifact):null,[text,learnedArtifact]);
 const projected=useMemo(()=>PENTERACT_VERTICES.map(p=>cameraProject3D(project5D(p,plane,angle),orbit)),[plane,angle,orbit]);
 const expertNodes=useMemo(()=>FIVE_EXPERTS.map(p=>({
  ...p,pos:cameraProject3D(project5D(p.prototype,plane,angle),orbit)
 })),[plane,angle,orbit]);
 const query=useMemo(()=>cameraProject3D(project5D(embedFiveSpace(text),plane,angle),orbit),[text,plane,angle,orbit]);
 const chosenExpert=expertNodes.find(node=>node.id===shadow.candidateId);
 const learnedPoint=learnedPreview?cameraProject3D(project5D(learnedPreview.coordinate,plane,angle),orbit):null;
 const sliceGeometry=useMemo(()=>sectionPenteract5D(slice),[slice]);
 const sliceProjected=useMemo(()=>sliceGeometry.vertices.map(p=>cameraProject3D(project5D(p,plane,angle),orbit)),[sliceGeometry,plane,angle,orbit]);
 return <section className="october-5d" aria-label="阿土伯 Penteract 五維架構與理解優先漏斗">
  <header className="october-5d-intro">
   <p className="october-5d-kicker">OCTOBER / PENTERACT LAB</p>
   <h2>五維空間 × 理解優先漏斗</h2>
   <p>真正的 R⁵ 幾何旋轉與投影，先理解，再逐層縮小候選能力。這是本機實驗路由視覺化；尚未取代正式模型或 Diana 權限判斷。</p>
  </header>
  <div className="october-5d-grid">
   <div className="october-5d-panel">
    <div className="october-5d-heading"><strong>01 · 五維空間</strong><small>32 個頂點 / 80 條邊 / 10 個旋轉平面</small></div>
    <div className="october-5d-space">
     <svg role="img" aria-label="五維超立方體經五維旋轉、三維觀察視角與透視投影到二維；白色點代表頂點"  viewBox="0 0 560 374" preserveAspectRatio="xMidYMid meet">
      <defs><radialGradient id="october-five-glow"><stop stopColor="#a5a5a5" stopOpacity=".17"/><stop offset="1" stopColor="#bfbfbf" stopOpacity="0"/></radialGradient></defs>
      <ellipse cx="280" cy="186" rx="235" ry="150" fill="url(#october-five-glow)"/>
      {PENTERACT_EDGES.map(([a,b])=><line key={a+"-"+b} x1={projected[a].x} y1={projected[a].y}
       x2={projected[b].x} y2={projected[b].y} stroke="currentColor" opacity={0.13+(projected[a].depth+projected[b].depth+5)/35} strokeWidth="1.2"/>)}
      {projected.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r={p.radius} fill="currentColor" opacity={showSlice?".21":".7"}/>)}
      {showSlice&&<g aria-label="固定 W 與 V 的三維空間截面">
       {sliceGeometry.edges.map(([a,b])=><line key={`section-${a}-${b}`} x1={sliceProjected[a].x} y1={sliceProjected[a].y} x2={sliceProjected[b].x} y2={sliceProjected[b].y} stroke="currentColor" strokeWidth="2.5" opacity=".85"/>)}
       {sliceProjected.map((p,i)=><circle key={`section-v-${i}`} cx={p.x} cy={p.y} r="4" fill="currentColor" opacity=".94"/>)}
      </g>}
      {shadow.status==="candidate"&&chosenExpert&&<line x1={query.x} y1={query.y} x2={chosenExpert.pos.x} y2={chosenExpert.pos.y} stroke="currentColor" strokeWidth="2" strokeDasharray="5 5" opacity=".85"/>}
      {expertNodes.filter(p=>showAll||(shadow.status==="candidate"&&plan.routes.some(r=>r.id===p.id))).map(x=>
       <g key={x.id}><circle cx={x.pos.x} cy={x.pos.y} r="7" fill="#fff" stroke="#8d8d8d" strokeWidth="1.5"/><title>{x.title}：五維原型座標（非實測語意精度）</title></g>)}
      <circle cx={query.x} cy={query.y} r="10" fill="#111" stroke="#fff" strokeWidth="3"/>
      <circle cx={query.x} cy={query.y} r="15" fill="none" stroke="#111" opacity=".36"/>
      {learnedPoint&&<g aria-label="從本機權重計算的五維學習投影（僅供影子測試）">
       <circle cx={learnedPoint.x} cy={learnedPoint.y} r="7" fill="none" stroke="#767676" strokeDasharray="3 2" strokeWidth="2"/>
       <title>實際 CPU 訓練的 5D 專家投影，不代表授權或語意正確</title>
      </g>}
      <text x="14" y="29" fontSize="12" fill="currentColor" opacity=".6">PENTERACT / R⁵ → R³ ORBIT → R²</text>
     </svg>
    </div>
    <div className="october-5d-controls">
     <label>旋轉平面
      <select value={plane} onChange={e=>setPlane(e.target.value as RotationPlane)}>
       {ROTATION_PLANES.map(p=><option value={p} key={p}>{p.toUpperCase()}</option>)}
      </select>
     </label>
     <label>五維旋轉角度 <output>{Math.round(angle*180/Math.PI)}°</output>
      <input type="range" min="-3.14" max="3.14" step=".02" value={angle} onChange={e=>setAngle(Number(e.target.value))}/>
     </label>
     <label>三維視角 · 水平 <output>{Math.round(orbit.yaw*180/Math.PI)}°</output>
      <input aria-label="3D camera horizontal orbit" type="range" min="-3.14" max="3.14" step=".02" value={orbit.yaw} onChange={e=>setOrbit(p=>({...p,yaw:Number(e.target.value)}))}/>
     </label>
     <label>三維視角 · 俯仰 <output>{Math.round(orbit.pitch*180/Math.PI)}°</output>
      <input aria-label="3D camera vertical orbit" type="range" min="-1.3" max="1.3" step=".02" value={orbit.pitch} onChange={e=>setOrbit(p=>({...p,pitch:Number(e.target.value)}))}/>
     </label>
     <label>三維視角 · 縮放 <output>{Math.round(orbit.zoom*100)}%</output>
      <input aria-label="3D camera zoom" type="range" min=".65" max="1.5" step=".05" value={orbit.zoom} onChange={e=>setOrbit(p=>({...p,zoom:Number(e.target.value)}))}/>
     </label>
     <label className="october-5d-check"><input type="checkbox" checked={showAll} onChange={e=>setShowAll(e.target.checked)}/> 顯示全部專家原型</label>
     <label className="october-5d-check"><input type="checkbox" checked={showSlice} onChange={e=>setShowSlice(e.target.checked)}/> 顯示五維空間的三維截面</label>
     {showSlice&&<>
      <label>內在 W 座標 <output>{slice.w.toFixed(2)}</output>
       <input aria-label="5D section W" type="range" min="-1" max="1" step=".05" value={slice.w} onChange={e=>setSlice(s=>({...s,w:Number(e.target.value)}))}/>
      </label>
      <label>內在 V 座標 <output>{slice.v.toFixed(2)}</output>
       <input aria-label="5D section V" type="range" min="-1" max="1" step=".05" value={slice.v} onChange={e=>setSlice(s=>({...s,v:Number(e.target.value)}))}/>
      </label>
     </>}
    </div>
    <p className="october-5d-note">真正的五維距離與旋轉：六個等距專家錨點形成 R⁵ 的正五維單純形（5-simplex）；以受限詞彙特徵映射問題。可觀察固定旋轉前 W／V 的精確三維截面（8 頂點、12 邊）；旋轉發生在截取後。五維旋轉後可獨立調整三維相機角度、俯仰與縮放。這不是已訓練的神經語意空間，也不代表路由準確率。</p>
   </div>
   <div className="october-5d-panel">
    <div className="october-5d-heading"><strong>02 · 漏斗運算流水線</strong><small>上寬下窄 / 理解優先</small></div>
    <svg viewBox="0 0 560 465" role="img" aria-label="五層漏斗：理解問題分配超過一半的規劃預算，接著經五維路由、證據查核、簡潔輸出與獨立驗證">
     {plan.stages.map((s,i)=>{
      const top=WIDTH[i]*510,bottom=WIDTH[i+1]*510;
      const y=19+i*86,x=(560-top)/2,xx=(560-bottom)/2;
      return <g key={s.id}>
       <path d={`M${x} ${y} H${x+top} L${xx+bottom} ${y+FUNNEL_HEIGHT} H${xx} Z`}
        fill={i===0?"#202020":i===4?"#4b4b4b":"#343434"} stroke="#777" strokeWidth=".8"/>
       <text x="280" y={y+29} textAnchor="middle" fill="#fff" fontSize="13" fontWeight="600">{s.label}</text>
       <text x="280" y={y+51} textAnchor="middle" fill="#d5d5d5" fontSize="12">{s.budgetPct}% 規劃預算 · 候選 ≤ {s.maxCandidates}</text>
      </g>;
     })}
    </svg>
    <p className="october-5d-note"><strong>注意：</strong>以上百分比是尚未接上 GPU 計數器的「抽象運算預算」，**不是實際瓦數或 Token 使用率**。正式啟用前需用 Ollama／LUCA 觀測實際耗能、延遲、正確率。</p>
   </div>
  </div>
  <div className="october-5d-demo">
   <label htmlFor="october-5d-query">以一個問題體驗五維空間如何選擇候選節點</label>
   <textarea id="october-5d-query" rows={3} maxLength={1024} value={text} onChange={e=>setText(e.target.value)} placeholder="輸入問題；只在目前瀏覽器中計算，不會上傳"/>
   <div className="october-5d-stats">
    <div><strong>{plan.understandingEffortPct}%</strong><small>優先理解的規劃預算</small></div>
    <div><strong>{plan.routes.length}</strong><small>候選專家（非已執行）</small></div>
    <div><strong>{plan.ambiguity==="high"?"高":plan.ambiguity==="medium"?"中":"低"}</strong><small>啟發式歧義程度</small></div>
   </div>
   <section className="october-5d-learned" aria-label="可訓練五維投影器的本機影子模式">
    <h3>03 · 可訓練五維投影器 <small>本機載入權重 / 不執行工具</small></h3>
    <p>可從 GitHub Actions 下載「OCTUBER 5D · 10M」權重與報告。先本機載入權重供影子預覽，再提供同一批次的訓練報告完成 SHA-256 配對，才可手動啟用阿土伯唯讀串聯。已執行的一千萬次更新不代表最後一次的權重最佳，故訓練器保留合成驗證損失最低的檢查點。這不是來源簽章，也不會切換正式路由。</p>
    <label className="october-5d-file">讀取 CPU 訓練權重（JSON，不超過 180 KB）
     <input aria-label="Upload local five-dimensional projector weights" type="file" accept=".json,application/json" onChange={async e=>{
      const selected=e.currentTarget.files?.[0];
      e.currentTarget.value="";
      if(!selected)return;
      // Never keep a previously activated bridge after replacing the file.
      clearAtuberFiveDSandbox();setAtuberBridgeEnabled(false);
      setLearnedArtifact(null);setLearnedArtifactRaw("");setVerifiedReceipt(null);
      setLearnedError("");
      if(selected.size>180000){setLearnedError("權重檔超過本機 180 KB 限制");return;}
      try{
       const raw=await selected.text();
       const parsed=JSON.parse(raw);
       setLearnedArtifact(assertLearnedFiveWeights(parsed));
       setLearnedArtifactRaw(raw);
      }catch{
       setLearnedError("權重檔案格式、維度或訓練來源不符合 5D 規格");
      }
     }}/>
    </label>
    {learnedArtifact&&<label className="october-5d-file">再載入同一次訓練的報告（five-d-sandbox-report.json；用於比對 SHA-256）
     <input aria-label="Upload corresponding five-dimensional training report" type="file" accept=".json,application/json" onChange={async e=>{
      const selected=e.currentTarget.files?.[0];e.currentTarget.value="";
      setVerifiedReceipt(null);setLearnedError("");
      clearAtuberFiveDSandbox();setAtuberBridgeEnabled(false);
      if(!selected||!learnedArtifactRaw)return;
      if(selected.size>60000){setLearnedError("訓練報告超出 60 KB 限制");return;}
      try{
       const report=JSON.parse(await selected.text());
       setVerifiedReceipt(await verifySyntheticFiveDBundle(learnedArtifactRaw,report));
      }catch{
       setLearnedError("訓練報告與五維權重的摘要不符，或不是有效的 1,000 萬步檢查點配對");
      }
     }}/>
    </label>}
    {verifiedReceipt&&<p role="status" className="october-5d-note">
     已完成本機 SHA-256 檔案配對：實際執行 1,000 萬次數值更新，載入第 {verifiedReceipt.selectedStep.toLocaleString("en-US")} 步的最佳合成驗證檢查點。
     這是檔案一致性檢查，不是來源簽章、人工盲測或正式路由授權。
    </p>}
    {learnedError&&<p role="alert">{learnedError}</p>}
    {learnedArtifact&&<div className="october-5d-controls">
     <button type="button" onClick={()=>{
      if(atuberBridgeEnabled||atuberFiveDSandboxActive()){
       clearAtuberFiveDSandbox();setAtuberBridgeEnabled(false);
      }else{
       if(!verifiedReceipt)return;
       activateAtuberFiveDSandbox(verifiedReceipt.artifact);setAtuberBridgeEnabled(true);
      }
     }} disabled={!atuberBridgeEnabled&&!verifiedReceipt}>{atuberBridgeEnabled?"停止串聯阿土伯五維影子建議":"核對訓練報告後啟用阿土伯 × Detroit 唯讀影子串聯"}</button>
     <small>只在你明確輸入「阿土伯：五維分析 ...」時比對；不會修改主模型、授權工具或保存聊天內容。重新整理網頁即清除。</small>
    </div>}
    {learnedPreview?<div className="october-5d-learning-grid">
     <div><strong>{learnedPreview.status==="candidate"?learnedPreview.candidateId:"選擇棄權"}</strong><small>實際訓練 5D 投影 · 影子候選</small></div>
     <div><strong>{shadow.status==="candidate"?shadow.candidateId:"選擇棄權"}</strong><small>原有幾何啟發式 · 基準</small></div>
     <div><strong>{learnedPreview.confidence===null?"—":Math.round(learnedPreview.confidence*100)+"%"}</strong><small>未校準 softmax（非準確率）</small></div>
    </div>:<p className="october-5d-note">尚未載入已訓練權重。預設只顯示原有五維幾何；即使載入模型，也完全不授予 Diana、Slime 或 Ceres 權限。</p>}
    <p className="october-5d-note">權重由本地 JSON 讀取，僅驗證檔案結構與宣告的訓練來源，未進行獨立數位簽章驗證；任何結果均不可視為正式模型品質背書。已知第一次訓練在混合意圖的棄權能力弱於舊版，故不得自動上線。</p>
   </section>
   <section className="october-5d-observed" aria-label="本次工作階段中的真實 Ollama 漏斗量測">
    <h3>04 · 模型實際量測 <small>僅記憶體暫存 / 不保留問題內容</small></h3>
    {measured?.summary.status==="measured"?<>
     <div className="october-5d-observed-grid">
      <div><strong>{measured.summary.understandingGeneratedSharePct}%</strong><small>理解階段生成 Token 佔比</small></div>
      <div><strong>{measured.summary.targetMet?"已達":"未達"}</strong><small>55% 參考目標（非功耗）</small></div>
      <div><strong>{measured.summary.understandingElapsedSharePct===null?"—":measured.summary.understandingElapsedSharePct+"%"}</strong><small>理解階段耗時佔比</small></div>
     </div>
     <p>理解 {measured.understandingGeneratedTokens ?? "未提供"} / 回答 {measured.answerGeneratedTokens ?? "未提供"} 個生成 Token。Ollama 耗時及 Token 不等於 GPU 瓦特數。</p>
    </>:<p>尚未取得兩階段完整 Ollama 計數器。請先在聊天以 October 深度模式完成一次回答；不會生成虛構比例。</p>}
   </section>
   <div className="october-5d-routes">
    <h3>候選路由 · 五維幾何距離</h3>
    {shadow.status==="abstain"?<p role="status" className="october-5d-note">目前沒有足以選出單一專家的可靠線索（{shadow.reason==="no-lexical-evidence"?"未找到領域訊號":"多個專家距離相近"}）。五維路由選擇棄權，保留對話理解與 Diana 既有權限流程。</p>:
     plan.routes.map((r,i)=><div key={r.id}><span className="october-5d-index">0{i+1}</span><strong>{r.title}</strong><span>距離 {r.distance.toFixed(3)}</span><small>{r.id===shadow.candidateId?"五維影子首選；未執行":"備選，未執行"}</small></div>)}
   </div>
   <p className="october-5d-note">不能由模型、5D 座標或瀏覽器分數自行授予工具權限；真正操作仍必須經可信後端、Diana／Ceres 權限與 Verifier 核對。沒有把測試結果當成路由準確率。</p>
  </div>
 </section>;
}
