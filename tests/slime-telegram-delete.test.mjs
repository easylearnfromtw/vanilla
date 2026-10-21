import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("remote Owner revoke requires Telegram proof, unlike voluntary node leave",()=>{
 const slime=read("services/weiguo/slime.py");
 const gate=read("services/weiguo/slime_revoke_gate.py");
 assert.match(slime,/class RevokeProof\(BaseModel\)/);
 assert.match(slime,/def revoke\(node_id: str, body: RevokeProof/);
 assert.match(slime,/consume_revoke\(user\.sub, node_id, body\.code\)/);
 assert.match(gate,/operation='revoke'/);
 assert.match(gate,/BEGIN IMMEDIATE/);
 assert.match(gate,/compare_digest/);
 assert.match(gate,/attempts/);
 assert.match(gate,/failures >= 5/);
 assert.match(gate,/revoke_telegram_verified/);
 assert.match(slime,/\/v1\/slime\/node\/leave/);
 assert.match(slime,/def leave\(/);
});

test("Telegram Ceres issues node-bound, 12-hex deletion codes and has action buttons",()=>{
 const bot=read("services/weiguo/slime_telegram.py");
 const hub=read("services/weiguo/ceres_command_center.py");
 assert.match(bot,/secrets\.token_hex\(6\) if operation == "revoke"/);
 assert.match(bot,/from slime_revoke_gate import consume_revoke, RevokeDenied/);
 assert.match(bot,/最多錯誤 5 次/);
 assert.match(hub,/"remove:"\+node\["id"\]/);
 assert.match(hub,/re\.fullmatch\(r"remove:\[a-f0-9\]\{24\}"/);
});

test("Mini App does not delete without Telegram code and preserves signed Owner auth",()=>{
 const app=read("services/weiguo/ceres_slime_web.py");
 assert.match(app,/id="delete-code"/);
 assert.match(app,/id="delete-code-wrap"/);
 assert.match(app,/init_data:auth/);
 assert.match(app,/code: str \| None/);
 assert.match(app,/consume_revoke\(sub,row\["node_id"\],body\.code,chat\)/);
 assert.doesNotMatch(app,/if row\["operation"\]=="revoke":\s+changed=db\.execute\("DELETE FROM nodes/);
});
