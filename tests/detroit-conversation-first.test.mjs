import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {routeMessage} from "../src/assistant/chat-router.ts";
import {proposeProactiveDiana,planDianaNativeArtifact} from "../src/detroit/diana-auto.ts";
import {chooseDianaTool} from "../src/detroit/diana.ts";

const file=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const context={privateMode:false,hasCreamResult:false,online:true,hasModel:true};

test("Detroit proactively chooses verified or guarded tools from ordinary chat, without @ or slash commands",()=>{
 for(const [message,tool] of [
  ["幫我製作簡報","retina"],
  ["請生成一張插畫","bard"],
  ["請設計醫美品牌海報","luna"],
  ["請幫我製作電子報","janus"],
  ["幫我執行 Python 程式碼","medusa"],
  ["幫我掃描 Vanilla 資安漏洞","quirinus"],
  ["請查看 LUCA 故障紀錄狀態","luca"],
  ["請查詢 Telegram 訊息","ceres"]
 ]){
  assert.equal(proposeProactiveDiana(message,context)?.tool,tool,message);
  assert.equal(routeMessage(message,context).kind,"diana",message);
 }
});
test("native office output needs affirmative intent; format can be inferred from the conversation",()=>{
 assert.equal(planDianaNativeArtifact("幫我製作簡報")?.capability,"retina");
 const slides=planDianaNativeArtifact("幫我製作簡報");
 if(slides?.capability==="retina")assert.equal(slides.format,"pptx");
 const memo=planDianaNativeArtifact("幫我產生 Word檔");
 if(memo?.capability==="retina")assert.equal(memo.format,"docx");
 assert.equal(planDianaNativeArtifact("什麼是簡報"),null);
 assert.equal(planDianaNativeArtifact("不要下載 PDF"),null);
 assert.equal(planDianaNativeArtifact("寄送電子報給所有人"),null);
});
test("tool selection does not imply execution or redirect the user to a separate studio",()=>{
 const chat=file("src/local-ai/LocalChat.tsx");
 assert.match(chat,/executeDetroitNative<NativeLunaResult>\("luna"/);
 assert.match(chat,/executeDetroitNative<NativeRetinaResult>\("retina"/);
 assert.match(chat,/executeDetroitNative<NativeBardResult>\("bard"/);
 assert.match(chat,/executeDetroitNative<NativeMedusaResult>\("medusa"/);
 assert.match(chat,/executeDetroitNative<NativeQuirinusResult>\("quirinus"/);
 assert.match(chat,/executeDetroitNative<NativeLucaResult>\("luca"/);
 assert.match(chat,/executeDetroitNative<NativeCeresResult>\("ceres"/);
 assert.match(chat,/const route=image\?\(\{kind:"continue"\}/);
 assert.doesNotMatch(chat,/if\(pick.kind==="open"&&pick.event\)/);
 assert.doesNotMatch(chat,/Diana 選擇 .*已開啟工具工作區/);
 const app=file("src/App.tsx"),home=file("src/local-ai/ChatHome.tsx");
 assert.doesNotMatch(app,/<nav aria-label="工具">/);
 assert.doesNotMatch(home,/aria-label="主要工具"|vh-tile/);
 assert.doesNotMatch(file("src/local-ai/MessageArtifacts.tsx"),/vanilla-open-detroit/);
});
test("sensitive operations are consent-bound, private mode remains enforced",()=>{
 const bus=file("src/detroit/capability-bus.ts");
 assert.match(bus,/meta.requiresApproval&&!context.approved/);
 assert.match(bus,/context.privateMode&&meta.requiresNetwork/);
 const chat=file("src/local-ai/LocalChat.tsx");
 assert.match(chat,/Quirinus 本次安全掃描/);
 assert.match(chat,/Medusa 沙盒執行/);
 assert.match(chat,/可能使用 API 額度或產生費用/);
 assert.match(chat,/不會自動觸發其他工具或發送回覆/);
});
