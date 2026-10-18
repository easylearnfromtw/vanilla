import * as webllm from "@mlc-ai/web-llm";

export const LOCAL_MODEL = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";
export type ChatTurn = {role:"user"|"assistant";content:string};
let engine: webllm.MLCEngine | null = null;
let loading: Promise<webllm.MLCEngine> | null = null;

export async function loadLocalModel(onProgress:(message:string,progress:number)=>void):Promise<void>{
  if(engine)return;
  if(!("gpu" in navigator))throw new Error("目前瀏覽器沒有 WebGPU，無法執行此本地模型。請使用支援 WebGPU 的 Safari 或桌面瀏覽器。");
  if(!loading)loading=webllm.CreateMLCEngine(LOCAL_MODEL,{
    initProgressCallback:report=>onProgress(report.text,report.progress)
  }).then(instance=>(engine=instance)).then(()=>engine!).catch(error=>{loading=null;throw error;});
  await loading;
}
export function isLocalModelReady():boolean{return engine!==null;}
export async function generateLocalReply(
  history:ChatTurn[],
  onText:(text:string)=>void
):Promise<string>{
  if(!engine)throw new Error("請先下載並載入本地 AI 模型");
  const messages:webllm.ChatCompletionMessageParam[]=[
    {role:"system",content:"你是 Vanilla，一個重視隱私的臺灣個人 AI 助手。所有一般對話、說明、建議、介面文案均必須使用臺灣繁體中文（zh-TW），採用臺灣常用詞彙與標點，不得輸出簡體中文；使用者明確要求其他語言、引用原文、程式碼、API 名稱或專有名詞時例外。回答清楚、準確，不捏造資訊。"},
    ...history.slice(-12).map(turn=>({role:turn.role,content:turn.content} as webllm.ChatCompletionMessageParam))
  ];
  const stream=await engine.chat.completions.create({messages,temperature:0.7,max_tokens:512,stream:true});
  let answer="";
  for await(const chunk of stream){
    answer+=chunk.choices[0]?.delta?.content??"";
    onText(answer);
  }
  return answer;
}
