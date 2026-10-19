/** External citations are navigation targets, never executable URLs. */
export function safeExternalURL(input:string):string|null{
 try{
  const url=new URL(input);
  if(url.protocol!=="https:"&&url.protocol!=="http:")return null;
  if(url.username||url.password)return null;
  return url.toString();
 }catch{return null;}
}
