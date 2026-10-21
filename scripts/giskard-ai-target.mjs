#!/usr/bin/env node
/**
 * Actual Vanilla TypeScript functions, not a mocked chatbot.
 * Called by Giskard Checks in a separate process. No user data or network.
 * Use the repository's TS extension loader, as existing Vanilla tests do.
 */
import { classifyTask } from "../src/ai/task-kind.ts";
import { classifyTaiwanTopic } from "../src/ai/taiwan-routing.ts";
import { validateWebLLMMessages } from "../src/local-ai/request-guard.ts";
import { chooseDianaTool } from "../src/detroit/diana.ts";
import { routeMessage } from "../src/assistant/chat-router.ts";

try {
  const req = JSON.parse(process.argv[2] || "{}");
  let value;
  switch (req.action) {
    case "task":
      value = classifyTask(req.text || "", req.image === true);
      break;
    case "taiwan":
      value = classifyTaiwanTopic(req.text || "");
      break;
    case "route":
      value = routeMessage(req.text || "", {
        privateMode: req.privateMode === true, hasCreamResult: false
      }).kind;
      break;
    case "diana": {
      const choice = chooseDianaTool(req.text || "", {
        privateMode: req.privateMode === true, hasCreamResult: false,
        online: true, hasModel: true
      }, req.forcedTool || null);
      value = choice.tool + ":" + choice.kind;
      break;
    }
    case "webllm": {
      try {
        validateWebLLMMessages(req.messages || [], req.mode === "recovery" ? "recovery" : "normal");
        value = true;
      } catch {
        value = false;
      }
      break;
    }
    default:
      throw Error("Unsupported test action");
  }
  process.stdout.write(JSON.stringify({ value }) + "\n");
} catch (error) {
  process.stderr.write("Vanilla Giskard target failed: " + String(error?.message || error) + "\n");
  process.exitCode = 1;
}
