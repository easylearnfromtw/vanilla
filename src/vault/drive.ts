/** Minimal Google Drive appDataFolder adapter. OAuth access token is supplied by a separate consent flow. */
import type { MemberId, VaultEnvelope } from "./crypto";
const DRIVE = "https://www.googleapis.com/drive/v3/files";
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
export function vaultFilename(member: MemberId): string { return "vanilla-v1-" + member + ".encrypted.json"; }
function auth(token: string): HeadersInit {
  if (!token) throw new Error("Google OAuth 授權尚未完成");
  return {Authorization: "Bearer " + token};
}
export async function listVaultFiles(token: string): Promise<Array<{id:string;name:string;modifiedTime?:string}>> {
  const url = DRIVE + "?spaces=appDataFolder&pageSize=100&fields=nextPageToken,files(id,name,modifiedTime)";
  const result: Array<{id:string;name:string;modifiedTime?:string}> = [];
  let pageToken: string | undefined;
  do {
    const res = await fetch(pageToken ? url+"&pageToken="+encodeURIComponent(pageToken) : url, {headers:auth(token)});
    if (!res.ok) throw new Error("Drive list failed: " + res.status);
    const body = await res.json() as {files?:typeof result;nextPageToken?:string};
    result.push(...(body.files ?? [])); pageToken=body.nextPageToken;
  } while(pageToken);
  return result;
}
export async function downloadVault(token: string, id: string): Promise<VaultEnvelope> {
  const res = await fetch(DRIVE+"/"+encodeURIComponent(id)+"?alt=media",{headers:auth(token)});
  if (!res.ok) throw new Error("Drive download failed: "+res.status);
  return res.json() as Promise<VaultEnvelope>;
}
/** Creates a new immutable snapshot; callers must resolve competing snapshots explicitly. */
export async function uploadVaultSnapshot(token: string, envelope: VaultEnvelope): Promise<string> {
  const boundary = "vanilla_"+crypto.randomUUID().replaceAll("-","");
  const metadata = JSON.stringify({name:vaultFilename(envelope.member)+"."+Date.now(),parents:["appDataFolder"],mimeType:"application/json"});
  const body = "--"+boundary+"\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"+metadata+"\r\n--"+boundary+"\r\nContent-Type: application/json\r\n\r\n"+JSON.stringify(envelope)+"\r\n--"+boundary+"--";
  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",{
    method:"POST",headers:{...auth(token),"Content-Type":"multipart/related; boundary="+boundary},body
  });
  if (!res.ok) throw new Error("Drive upload failed: "+res.status);
  const data = await res.json() as {id?:string};
  if (!data.id) throw new Error("Drive did not return a file ID");
  return data.id;
}
