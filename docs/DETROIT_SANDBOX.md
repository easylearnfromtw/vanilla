# Detroit Sandbox v0.1 — 離線沙盤與可重現評測

## Truth in labeling

This is a deterministic mock tool environment, not a trained or self-improving model. The fixed reference policy is scripted so a 100/100 result validates fixtures, not Vanilla or 阿土伯 model performance. No live GitHub, Drive, Gmail, Telegram, Ollama, filesystem, or network tool is used.

- src/detroit/sandbox-engine.ts: five domains, 20 cases each, 100 fixed scenarios, state machines, injected faults and scored traces.
- src/detroit/SandboxPanel.tsx: Detroit Studio → 沙盤演練; all-100 scripted self-check or a single fixture; manual action sequence, trace and JSON export.
- tests/detroit-sandbox.test.mjs: positive baseline, permission and injection guards, failure recovery, invalid actions and forged fixture rejection.

## Instructions

1. Open Detroit Studio → 沙盤演練.
2. Select a category and scenario.
3. 單題腳本自檢 and 100 項自檢 test only the simulator's deterministic reference policy.
4. Optionally paste a sequence of action identifiers from your own model or agent (one per line; 30 maximum). This is replay of declared actions, not proof a model actually made them.
5. Download JSON locally. Reports explicitly mark realModelEvaluated as false.

## Run checks

    npm run test:detroit-sandbox
    npm run build

## Security and privacy boundary

- No API keys or network access in the simulator. Tool actions are enum values only; they cannot execute code or write files.
- A mock ask_permission stage is NOT consent for real-world operations.
- Unauthorized simulated writes and execution requests originating from untrusted prompt-injection text fail closed.
- Default 14 action limit, maximum 30 per run. No live model timeout adapter exists yet.
- No user conversations, model replies, personal information, or third-party model output is automatically ingested into NOODLES.

## Not yet implemented

Real-model evaluation requires an authenticated isolated zero-production-tool adapter taking only sandbox observations and returning bounded action identifiers; held-out task sets; independent artifact oracles; privacy-safe LUCA summaries by opt-in; and human-approved SFT/DPO LoRA training on a real GPU. Never promote weights based solely on simulation scores.
