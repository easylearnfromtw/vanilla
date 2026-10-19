import test from "node:test";
import assert from "node:assert/strict";
import {forgetMemoryWithAttachment,forgetMemory,listMemories} from "../src/memory/drive-memory.ts";
import {deleteOwnedCopy} from "../src/local-ai/saved-file-resolver.ts";
import {getWorkspaceMetadata,trashWorkspaceFile} from "../src/workspace/cloud-drive.ts";

let serial=0;
function googleDriveFixture(options={}){
 const sequence=++serial,mail="owner"+sequence+"@example.test";
 const id="memory-"+sequence,sourceId="attachment-"+sequence,indexId="index-"+sequence;
 const record={version:1,id,kind:"file",title:"app.js",description:"saved",fileId:sourceId,fileName:"app.js",
  fileMimeType:"application/javascript",createdAt:"2026-10-19T00:00:00Z",updatedAt:"2026-10-19T00:00:00Z",
  labels:[],ownerEmail:mail};
 const store=new Map([
  [indexId,{id:indexId,name:"vanilla-memory-"+id+".json",mimeType:"application/json",parents:["workspace-folder"],
   version:"1",description:"Created by Vanilla Workspace",trashed:false,body:JSON.stringify(record)}],
  [sourceId,{id:sourceId,name:"app.js",mimeType:"application/javascript",parents:options.moved?["outside-folder"]:["workspace-folder"],
   version:"1",description:options.foreign?"User document":"Created by Vanilla Workspace",
   trashed:options.alreadyTrashed??false,body:"console.log('test')"}]
 ]);
 if(options.missing)store.delete(sourceId);
 const calls={patched:[],get:[]};
 const previous={fetch:globalThis.fetch,window:globalThis.window,sessionStorage:globalThis.sessionStorage};
 globalThis.window=new EventTarget();
 const entries=new Map([["vanilla.drive.session.v1",JSON.stringify({token:"fake",email:mail,expiresAt:Date.now()+3600000})]]);
 globalThis.sessionStorage={
  getItem:key=>entries.get(key)??null,
  setItem:(key,value)=>entries.set(key,String(value)),
  removeItem:key=>entries.delete(key)
 };
 globalThis.fetch=async(input,init={})=>{
  const url=new URL(String(input)),method=init.method||"GET";
  assert.equal(url.hostname,"www.googleapis.com");
  if(url.pathname==="/drive/v3/files"&&method==="GET"){
   const q=url.searchParams.get("q")||"";
   if(q.includes("mimeType = 'application/vnd.google-apps.folder'"))
    return Response.json({files:[{id:"workspace-folder",name:"Vanilla Workspace",mimeType:"application/vnd.google-apps.folder"}]});
   const files=[...store.values()].filter(x=>!x.trashed&&x.parents.includes("workspace-folder")).map(({body,...metadata})=>metadata);
   return Response.json({files});
  }
  const fileId=decodeURIComponent(url.pathname.replace(/^\/drive\/v3\/files\//,""));
  const file=store.get(fileId);
  if(method==="GET"){
   calls.get.push(fileId);
   if(options.forbidden&&fileId===sourceId)return new Response("no permission",{status:403});
   if(!file)return new Response("not found",{status:404});
   if(url.searchParams.get("alt")==="media")return new Response(file.body,{status:200});
   const {body,...metadata}=file;
   return Response.json(metadata);
  }
  if(method==="PATCH"){
   if(!file)return new Response("not found",{status:404});
   calls.patched.push(fileId);
   if(!options.patchIgnored)file.trashed=true;
   return Response.json({id:fileId});
  }
  throw Error("Unexpected Drive request "+method+" "+url);
 };
 return {id,indexId,sourceId,store,calls,restore(){
  globalThis.fetch=previous.fetch;
  globalThis.window=previous.window;
  globalThis.sessionStorage=previous.sessionStorage;
 }};
}

test("original moved outside Vanilla Workspace is trashed by immutable ID; memory UUID is removed",async()=>{
 const f=googleDriveFixture({moved:true});
 try{
  assert.equal((await listMemories()).length,1);
  const deleted=await forgetMemoryWithAttachment(f.id,true);
  assert.equal(deleted.original,"trashed");
  assert.equal(f.store.get(f.sourceId).trashed,true);
  assert.equal(f.store.get(f.indexId).trashed,true);
  assert.deepEqual(f.calls.patched,[f.sourceId,f.indexId]);
  assert.deepEqual(await listMemories(),[]);
 }finally{f.restore();}
});

test("inaccessible 404 original removes stale Vanilla entry, not falsely claiming original deletion",async()=>{
 const f=googleDriveFixture({missing:true});
 try{
  const result=await deleteOwnedCopy({source:"drive-memory",id:f.id,name:"app.js"});
  assert.equal(result.status,"index-only");
  assert.match(result.detail,/可能仍存在/);
  assert.equal(f.store.get(f.indexId).trashed,true);
  assert.deepEqual(f.calls.patched,[f.indexId]);
  assert.deepEqual(await listMemories(),[]);
 }finally{f.restore();}
});

test("pre-trashed original cleans memory index without trashing it a second time",async()=>{
 const f=googleDriveFixture({alreadyTrashed:true});
 try{
  const result=await forgetMemoryWithAttachment(f.id,true);
  assert.equal(result.original,"already-trashed");
  assert.deepEqual(f.calls.patched,[f.indexId]);
  assert.deepEqual(await listMemories(),[]);
 }finally{f.restore();}
});

test("untrusted memory reference never trashes unrelated Drive files",async()=>{
 const f=googleDriveFixture({foreign:true});
 try{
  const result=await forgetMemoryWithAttachment(f.id,true);
  assert.equal(result.original,"untrusted-reference");
  assert.equal(f.store.get(f.sourceId).trashed,false);
  assert.equal(f.store.get(f.indexId).trashed,true);
  assert.deepEqual(f.calls.patched,[f.indexId]);
 }finally{f.restore();}
});

test("403 and failed Drive state verification preserve memory index and report error",async()=>{
 for(const scenario of [{forbidden:true},{patchIgnored:true}]){
  const f=googleDriveFixture(scenario);
  try{
   await assert.rejects(forgetMemoryWithAttachment(f.id,true),/權限不足|尚未確認/);
   assert.equal(f.store.get(f.indexId).trashed,false);
   assert.deepEqual((await listMemories()).map(x=>x.id),[f.id]);
  }finally{f.restore();}
 }
});

test("memory UUID deletion is direct rather than impossible semantic search",async()=>{
 const f=googleDriveFixture({});
 try{
  const entry=await forgetMemory(f.id);
  assert.equal(entry.id,f.id);
  assert.equal(f.store.get(f.indexId).trashed,true);
  assert.equal(f.store.get(f.sourceId).trashed,false); // metadata-only deletion leaves original
 }finally{f.restore();}
});

test("Drive trash helper verifies real remote trashed flag, not folder absence",async()=>{
 const f=googleDriveFixture({patchIgnored:true});
 try{
  const original=await getWorkspaceMetadata("fake",f.sourceId);
  await assert.rejects(trashWorkspaceFile("fake",original),/尚未確認/);
  assert.equal(f.store.get(f.sourceId).trashed,false);
 }finally{f.restore();}
});
