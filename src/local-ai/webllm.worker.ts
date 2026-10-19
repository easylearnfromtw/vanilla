/** Runs WebLLM inference off the main thread so the chat UI stays responsive on iPhone. */
import {WebWorkerMLCEngineHandler} from "@mlc-ai/web-llm";
const handler=new WebWorkerMLCEngineHandler();
self.onmessage=(message:MessageEvent)=>{handler.onmessage(message);};
