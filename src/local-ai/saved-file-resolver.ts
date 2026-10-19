/** Verified file resolution across the owner's actual IndexedDB, Drive memories,
 * and Vanilla Workspace. Never ask a model to fabricate file content.
 */
import {attachmentOwner,listChatAttachments,getChatAttachment,removeChatAttachment,type SavedAttachment} from "../library/attachment-vault";
import {signedChatAccount} from "../vault/chat-sync";
import {driveSession,listWorkspaceFiles,getWorkspaceBlob,trashWorkspaceFile,type WorkspaceFile} from "../workspace/cloud-drive";
import {listMemories,previewMemoryAttachment,forgetMemoryWithAttachment,type MemoryRecord} from "../memory/drive-memory";
import {matchNamedFile} from "./file-intent";
export type SavedFileSource="device"|"drive-memory"|"drive-workspace";
export type ResolvedSavedFile={id:string;name:string;file:File;source:SavedFileSource;description:string};
export type SavedFileCandidate={id:string;name:string;source:SavedFileSource};
function currentOwner():string{return attachmentOwner(signedChatAccount());}
export async function locateSavedFile(name:string,scope:"any"|"cloud"|"local"="any"):Promise<ResolvedSavedFile|null>{
 const owner=currentOwner();
 if(scope!=="cloud"){
  const local=await listChatAttachments(owner);
  const item=matchNamedFile(local,name);
  if(item){
   const complete=await getChatAttachment(item.id,owner);
   return {id:item.id,name:item.name,source:"device",description:"本裝置 IndexedDB",
    file:new File([complete.blob],complete.name,{type:complete.type})};
  }
 }
 if(scope==="local"||!driveSession())return null;
 const memories=await listMemories();
 const memory=matchNamedFile(memories.filter(x=>Boolean(x.fileId)).map(x=>({id:x.id,name:x.fileName||x.title,record:x})),name);
 if(memory){
  const blob=await previewMemoryAttachment(memory.id);
  return {id:memory.id,name:memory.name,source:"drive-memory",description:"授權 Google Drive 記憶附件",
   file:new File([blob],memory.name,{type:memory.record.fileMimeType||blob.type})};
 }
 const session=driveSession();
 if(!session)return null;
 const workspace=await listWorkspaceFiles(session.token),item=matchNamedFile(workspace,name);
 if(!item)return null;
 const blob=await getWorkspaceBlob(session.token,item.id);
 return {id:item.id,name:item.name,source:"drive-workspace",description:"授權 Google Drive Vanilla 工作區",
  file:new File([blob],item.name,{type:item.mimeType||blob.type})};
}
/** Enumerate copies by exact title. File ID, not title, is the deletion handle.
 * Same-name files are shown as multiple copies, not silently merged.
 */
export async function exactOwnedCopies(name:string):Promise<SavedFileCandidate[]>{
 const target=name.trim().toLowerCase(),out:SavedFileCandidate[]=[];
 const local=await listChatAttachments(currentOwner());
 for(const x of local)if(x.name.toLowerCase()===target)out.push({id:x.id,name:x.name,source:"device"});
 const session=driveSession();
 if(!session)return out;
 const memories=await listMemories();
 const contained=new Set<string>();
 for(const x of memories)if(x.fileId&&(x.fileName||x.title).toLowerCase()===target){
  contained.add(x.fileId);
  out.push({id:x.id,name:x.fileName||x.title,source:"drive-memory"});
 }
 for(const x of await listWorkspaceFiles(session.token))if(x.name.toLowerCase()===target&&!contained.has(x.id)){
  out.push({id:x.id,name:x.name,source:"drive-workspace"});
 }
 return out;
}
export async function deleteOwnedCopy(item:SavedFileCandidate):Promise<void>{
 if(item.source==="device"){
  await removeChatAttachment(item.id,currentOwner());
  try{await getChatAttachment(item.id,currentOwner());}catch{return;}
  throw Error("IndexedDB 仍保有刪除的附件："+item.name);
 }
 if(!driveSession())throw Error("雲端登入已過期，不能假裝成功刪除");
 if(item.source==="drive-memory"){
  await forgetMemoryWithAttachment(item.id,true);
  // Uncached records may take a moment; verify via fresh metadata lists.
  const existing=await listMemories();
  if(existing.some(x=>x.id===item.id))throw Error("記憶索引仍存在，請重新整理再確認");
  return;
 }
 const session=driveSession();
 if(!session)throw Error("Google Drive 權杖已過期");
 const all=await listWorkspaceFiles(session.token);
 const original=all.find(x=>x.id===item.id);
 if(!original)throw Error("Google Drive 已找不到此檔案，可能已刪除或搬移");
 await trashWorkspaceFile(session.token,original);
 const remaining=await listWorkspaceFiles(session.token);
 if(remaining.some(x=>x.id===item.id))throw Error("Drive 尚未確認移至垃圾桶；請查看 Google Drive");
}
