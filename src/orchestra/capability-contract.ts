/** Conservative contract for the read-only WeiGuo Orchestra capability report.
 * Never treat unknown tool ids, free-form operations or URLs as executable authority.
 */
import type {OrchestraToolId} from "./core";

const IDS:readonly OrchestraToolId[]=[
 "wordcraft","deckcraft","vectorcraft","photocraft",
 "pdfcraft","effectcraft","designcraft"
];
export type OrchestraBackendCapability={
 id:OrchestraToolId;
 status:"configured"|"unavailable";
 operations:("convert-markdown"|"combine-pdf")[];
 outputFormats:("docx"|"pdf")[];
 runtimeVerified:boolean;
};
export type OrchestraCapabilities={
 schemaVersion:1;
 execution:"family-gateway";
 engines:OrchestraBackendCapability[];
};
export function validateOrchestraCapabilities(input:unknown):OrchestraCapabilities {
 if(!input||typeof input!=="object"||Array.isArray(input))throw Error("Orchestra 能力資訊格式錯誤");
 const raw=input as Record<string,unknown>;
 if(raw.schemaVersion!==1||raw.execution!=="family-gateway"||!Array.isArray(raw.engines)||raw.engines.length!==IDS.length)
  throw Error("Orchestra 能力版本不相容");
 const seen=new Set<string>(),engines:OrchestraBackendCapability[]=[];
 for(const item of raw.engines){
  if(!item||typeof item!=="object"||Array.isArray(item))throw Error("無效的 Orchestra 引擎資料");
  const e=item as Record<string,unknown>,id=e.id as OrchestraToolId;
  if(!IDS.includes(id)||seen.has(id))throw Error("未授權或重複的 Orchestra 引擎");
  seen.add(id);
  if(e.status!=="configured"&&e.status!=="unavailable")throw Error("未知 Orchestra 狀態");
  if(typeof e.runtimeVerified!=="boolean"||!Array.isArray(e.operations)||!Array.isArray(e.outputFormats))throw Error("Orchestra 能力格式無效");
  const configured=e.status==="configured";
  if(configured&&id!=="wordcraft"&&id!=="pdfcraft")throw Error("此版本尚未實作其他 Craft 原生執行器");
  const isWord=id==="wordcraft";
  if(configured&&(e.operations.length!==1||e.operations[0]!== (isWord?"convert-markdown":"combine-pdf")||
      e.outputFormats.length!==(isWord?2:1)||
      e.outputFormats[0] !== (isWord?"docx":"pdf")||
      (isWord&&e.outputFormats[1]!=="pdf")))
    throw Error("Orchestra 執行權限不符本機允許清單");
  if(!configured&&(e.operations.length||e.outputFormats.length))throw Error("停用引擎不得宣告可執行操作");
  // Runtime success can only be asserted by an actual separately audited smoke test.
  if(e.runtimeVerified)throw Error("Orchestra 尚未支援原生引擎已驗收聲明");
  engines.push({id,status:e.status,
    operations:configured?(id==="wordcraft"?["convert-markdown"]:["combine-pdf"]):[],
    outputFormats:configured?(id==="wordcraft"?["docx","pdf"]:["pdf"]):[],
    runtimeVerified:false});
 }
 return {schemaVersion:1,execution:"family-gateway",engines};
}
export function wordcraftConfigured(status:OrchestraCapabilities|null):boolean {
 return status?.engines.some(x=>x.id==="wordcraft"&&x.status==="configured")===true;
}

export function pdfcraftConfigured(status:OrchestraCapabilities|null):boolean {
 return status?.engines.some(x=>x.id==="pdfcraft"&&x.status==="configured"&&
   x.operations.includes("combine-pdf"))===true;
}
