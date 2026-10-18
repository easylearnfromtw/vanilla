/** Encrypted, per-member local persistence. Unlocking is not authentication. */
import {encryptVault,decryptVault,type MemberId} from "../vault/crypto";
const PREFIX="vanilla.tools.encrypted.v1.";
export interface ToolSnapshot {version:1;calendar:unknown[];knowledge:unknown[];health:unknown[];updatedAt:string;}
export function emptySnapshot():ToolSnapshot{return {version:1,calendar:[],knowledge:[],health:[],updatedAt:new Date().toISOString()};}
export async function saveToolSnapshot(member:MemberId,secret:string,snapshot:ToolSnapshot):Promise<void>{
 if(snapshot.version!==1)throw new Error("Unsupported snapshot");
 const encrypted=await encryptVault(member,secret,snapshot);
 localStorage.setItem(PREFIX+member,JSON.stringify(encrypted));
}
export async function loadToolSnapshot(member:MemberId,secret:string):Promise<ToolSnapshot>{
 const raw=localStorage.getItem(PREFIX+member);
 if(!raw)return emptySnapshot();
 const value:unknown=JSON.parse(raw);
 if(!value||typeof value!=="object")throw new Error("Invalid encrypted snapshot");
 const data=await decryptVault<ToolSnapshot>(member,secret,value as Parameters<typeof decryptVault>[2]);
 if(data.version!==1||!Array.isArray(data.calendar)||!Array.isArray(data.knowledge)||!Array.isArray(data.health))throw new Error("Invalid snapshot content");
 return data;
}
