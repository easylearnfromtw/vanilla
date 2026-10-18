import type { MemberId, VaultEnvelope } from "./crypto";
const DB_NAME="vanilla-local-v1";
export async function openVaultDB(): Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains("vaults"))db.createObjectStore("vaults");};
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}
export async function saveEncryptedVault(member:MemberId,envelope:VaultEnvelope):Promise<void>{
  if(envelope.member!==member)throw new Error("Member mismatch");
  const db=await openVaultDB();
  try {await new Promise<void>((resolve,reject)=>{const tx=db.transaction("vaults","readwrite");tx.objectStore("vaults").put(envelope,member);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}
  finally{db.close();}
}
export async function loadEncryptedVault(member:MemberId):Promise<VaultEnvelope|undefined>{
  const db=await openVaultDB();
  try{return await new Promise((resolve,reject)=>{const tx=db.transaction("vaults","readonly");const req=tx.objectStore("vaults").get(member);req.onsuccess=()=>resolve(req.result as VaultEnvelope|undefined);req.onerror=()=>reject(req.error);});}
  finally{db.close();}
}
