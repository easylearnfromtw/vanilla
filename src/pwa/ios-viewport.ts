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
 // The layout viewport may stay full-height when iOS opens its software keyboard.
 // Keep a stable pre-keyboard baseline rather than trusting innerHeight alone.
 let unobscuredHeight=Math.max(window.innerHeight,vv?.height||0);
 let frame=0;
 const update=()=>{
  cancelAnimationFrame(frame);
  frame=requestAnimationFrame(()=>{
   const focused=document.activeElement instanceof HTMLElement && document.activeElement.matches('input:not([type="checkbox"]):not([type="radio"]),textarea,[contenteditable="true"]');
   const visualHeight=vv?.height||window.innerHeight;
   const offset=vv?.offsetTop||0;
   // Update baseline only when not editing; browser bars can otherwise hide
   // the keyboard overlap if they alter window.innerHeight at the same time.
   if(!focused)unobscuredHeight=Math.max(window.innerHeight,visualHeight);
   const keyboard=Math.max(0,unobscuredHeight-visualHeight-offset);
   const open=ios&&focused&&(keyboard>100||Boolean(vv&&visualHeight<window.screen.height*0.65));
   const height=open?Math.min(visualHeight,window.innerHeight):visualHeight;
   root.style.setProperty("--app-height",Math.round(height)+"px");
   root.style.setProperty("--vv-top",Math.round(vv?.offsetTop||0)+"px");
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
