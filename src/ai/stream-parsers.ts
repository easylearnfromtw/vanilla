/** Incremental readers for streamed model responses (Ollama NDJSON, Gemini/DeepSeek SSE).
 * They work with any WHATWG Response, so they are unit-tested with constructed streams.
 */
export async function readLines(response:Response,onLine:(line:string)=>void):Promise<void>{
 const body=response.body;
 if(!body){for(const line of (await response.text()).split(/\r?\n/))if(line.trim())onLine(line);return;}
 const reader=body.getReader(),decoder=new TextDecoder();
 let buffer="";
 for(;;){
  const {done,value}=await reader.read();
  if(done)break;
  buffer+=decoder.decode(value,{stream:true});
  let index;
  while((index=buffer.indexOf("\n"))>=0){
   const line=buffer.slice(0,index).replace(/\r$/,"");
   buffer=buffer.slice(index+1);
   if(line.trim())onLine(line);
  }
 }
 buffer+=decoder.decode();
 if(buffer.trim())onLine(buffer.replace(/\r$/,""));
}
export async function readNDJSON<T>(response:Response,onObject:(value:T)=>void):Promise<void>{
 await readLines(response,line=>{
  let value:T;
  try{value=JSON.parse(line) as T;}catch{return;}
  onObject(value);
 });
}
/** Server-sent events: calls onData with each event's joined `data:` payload; stops at [DONE]. */
export async function readSSE(response:Response,onData:(data:string)=>void):Promise<void>{
 let data:string[]=[],finished=false;
 const flush=()=>{if(data.length&&!finished){const payload=data.join("\n");data=[];if(payload.trim()==="[DONE]"){finished=true;return;}onData(payload);}else data=[];};
 const body=response.body;
 const handle=(line:string)=>{
  if(finished)return;
  if(line==="")return flush();
  if(line.startsWith(":"))return;
  if(line.startsWith("data:"))data.push(line.slice(5).replace(/^ /,""));
 };
 if(!body){for(const line of (await response.text()).split(/\r?\n/))handle(line);flush();return;}
 const reader=body.getReader(),decoder=new TextDecoder();
 let buffer="";
 for(;;){
  const {done,value}=await reader.read();
  if(done)break;
  buffer+=decoder.decode(value,{stream:true});
  let index;
  while((index=buffer.indexOf("\n"))>=0){
   const line=buffer.slice(0,index).replace(/\r$/,"");
   buffer=buffer.slice(index+1);
   handle(line);
  }
 }
 buffer+=decoder.decode();
 if(buffer)handle(buffer.replace(/\r$/,""));
 flush();
}
