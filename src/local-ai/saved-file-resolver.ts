/** Verified file resolution across the owner's actual IndexedDB, Drive memories,
 * and Vanilla Workspace. Never ask a model to fabricate file content.
 */
import {attachmentOwner,listChatAttachments,getChatAttachment,removeChatAttachment,type SavedAttachment} from "../library/attachment-vault";
import {signedChatAccount} from "../vault/chat-sync";
import {driveSession,listWorkspaceFiles,getWorkspaceBlob,trashWorkspaceFile,getWorkspaceMetadata,type WorkspaceFile} from "../workspace/cloud-drive";
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
export type OwnedCopyDeletion={
 status:"verified"|"index-only";
 detail:string;
};
export async function deleteOwnedCopy(item:SavedFileCandidate):Promise<OwnedCopyDeletion>{
 if(item.source==="device"){
  const owner=currentOwner();
  await removeChatAttachment(item.id,owner);
  if((await listChatAttachments(owner)).some(x=>x.id===item.id))throw Error("IndexedDB 仍保有刪除的附件："+item.name);
  return {status:"verified",detail:"已確認刪除本裝置 IndexedDB 附件："+item.name};
 }
 const session=driveSession();
 if(!session)throw Error("雲端登入已過期，不能假裝成功刪除");
 if(item.source==="drive-memory"){
  const result=await forgetMemoryWithAttachment(item.id,true);
  const existing=await listMemories();
  if(existing.some(x=>x.id===item.id))throw Error("記憶索引仍存在，請重新整理再確認");
  if(result.original==="missing-or-inaccessible")
   return {status:"index-only",detail:"已移除 Vanilla 雲端記憶索引："+item.name+"。原始附件無法透過 Drive 檔案 ID 存取，可能仍存在其他位置或帳號，不能確認刪除；請在 Google Drive 檢查。"};
  if(result.original==="untrusted-reference")
   return {status:"index-only",detail:"已移除 Vanilla 雲端記憶索引："+item.name+"。所指向的原始檔並非經驗證由 Vanilla 建立，為避免誤刪其他 Drive 檔案而未操作，可能仍存在。"};
  return {status:"verified",detail:result.original==="already-trashed"?
   "原始附件已位於 Google Drive 垃圾桶；已確認移除 Vanilla 雲端記憶索引："+item.name:
   result.original==="no-attachment"?"已確認移除無原始附件的雲端記憶索引："+item.name:
   "已確認原始附件移至 Google Drive 垃圾桶，並移除雲端記憶索引："+item.name};
 }
 // This candidate was enumerated from the authorized workspace; use immutable ID so
 // moving it between listing and deletion does not silently hide failed operations.
 const original=await getWorkspaceMetadata(session.token,item.id);
 await trashWorkspaceFile(session.token,original);
 if((await listWorkspaceFiles(session.token)).some(x=>x.id===item.id))throw Error("Drive 工作區仍顯示檔案；請重新整理並確認");
 return {status:"verified",detail:"已確認檔案移至 Google Drive 垃圾桶："+item.name};
}
