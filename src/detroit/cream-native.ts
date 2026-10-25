/** Actual CREAM local executor registered in the single Detroit capability bus.
 * Split from heavy native-executors so price statistics do not load
 * unrelated Retina, email, network and document dependencies.
 */
import {detroitBus,type DetroitCallContext} from "./capability-bus";
import {parseCreamCSV,analyzeCream,type CreamResult} from "../cream/core";
export type DetroitCreamInput={csv:string;source?:string};
function requireObject(input:unknown):Record<string,unknown>{
 if(!input||typeof input!=="object"||Array.isArray(input))throw Error("DETROIT_CREAM_INPUT_INVALID");
 return input as Record<string,unknown>;
}
export function registerDetroitCreamExecutor():void{
 if(detroitBus.isRunnable("cream"))return;
 detroitBus.register("cream",async (raw,context)=>{
  const data=requireObject(raw),csv=data.csv;
  if(typeof csv!=="string"||csv.length<4||csv.length>2_000_000)
   throw Error("DETROIT_CREAM_INPUT_LIMIT");
  if(context.signal?.aborted)throw Error("DETROIT_CREAM_CANCELLED");
  const source=typeof data.source==="string"?data.source.slice(0,120):"Detroit 匯入資料";
  return analyzeCream(parseCreamCSV(csv,source));
 });
}
/** Receipts reflect real deterministic CREAM execution, not a dummy capability. */
export async function executeDetroitCream(
 input:DetroitCreamInput,context:DetroitCallContext
):Promise<CreamResult>{
 registerDetroitCreamExecutor();
 const receipt=await detroitBus.execute("cream",input,context);
 if(receipt.capability!=="cream"||receipt.status!=="completed")
  throw Error("DETROIT_CREAM_RECEIPT_INVALID");
 return receipt.result as CreamResult;
}
