/** iPhone / installed-PWA viewport handling.
 * - Tracks the *visual* viewport so the composer stays above the on-screen keyboard and the
 *   header doesn't scroll away (iOS doesn't shrink 100dvh for the keyboard).
 * - Marks iOS / standalone so CSS can add safe-area padding.
 * - Asks the browser to keep local data (chats, CREAM, attachments) from automatic eviction.
 */
export function installViewportHandling():void{
 const root=document.documentElement;
 const ua=navigator.userAgent;
 const ios=/iP(?:hone|od|ad)/.test(ua)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
 const standalone=window.matchMedia?.("(display-mode: standalone)").matches||(navigator as Navigator&{standalone?:boolean}).standalone===true;
 root.dataset.ios=String(ios);
 root.dataset.standalone=String(Boolean(standalone));
 const vv=window.visualViewport;
 let frame=0;
 const update=()=>{
  cancelAnimationFrame(frame);
  frame=requestAnimationFrame(()=>{
   const height=vv?vv.height:window.innerHeight;
   const keyboard=vv?Math.max(0,window.innerHeight-vv.height-vv.offsetTop):0;
   root.style.setProperty("--app-height",Math.round(height)+"px");
   root.style.setProperty("--vv-top",Math.round(vv?.offsetTop||0)+"px");
   const open=keyboard>120;
   root.dataset.keyboard=open?"open":"closed";
   // iOS sometimes scrolls the whole document when focusing an input; pin it back.
   if(ios&&open&&window.scrollY!==0)window.scrollTo(0,0);
  });
 };
 vv?.addEventListener("resize",update);
 vv?.addEventListener("scroll",update);
 window.addEventListener("resize",update);
 window.addEventListener("orientationchange",update);
 document.addEventListener("focusin",update);
 document.addEventListener("focusout",()=>window.setTimeout(update,60));
 update();
}
export async function requestPersistentStorage():Promise<boolean>{
 try{
  if(!navigator.storage?.persist)return false;
  if(await navigator.storage.persisted?.())return true;
  return await navigator.storage.persist();
 }catch{return false;}
}
