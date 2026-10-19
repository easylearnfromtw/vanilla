/** Simplified → Traditional (Taiwan, with Taiwan phrasing: 軟體/資訊/網路/影片…).
 * OpenCC dictionaries are large, so they load on first use instead of in the startup bundle.
 * Code blocks and inline code are left untouched so identifiers and strings stay exact.
 */
type Convert=(text:string)=>string;
let converter:Convert|null=null;
let loading:Promise<Convert>|null=null;
export function ensureZhTw():Promise<Convert>{
 if(converter)return Promise.resolve(converter);
 if(!loading)loading=import("opencc-js").then(mod=>{converter=mod.Converter({from:"cn",to:"twp"});return converter;})
  .catch(error=>{loading=null;throw error;});
 return loading;
}
function convertProse(text:string):string{
 if(!converter)return text;
 // Keep fenced code and `inline code` byte-for-byte.
 return text.split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g).map((part,i)=>i%2===1?part:converter!(part)).join("");
}
/** Synchronous after ensureZhTw() resolved; returns the input unchanged before that. */
export function toTaiwanese(text:string):string{return convertProse(text);}
