# Vanilla browser-local inference prototype

Runtime: @mlc-ai/web-llm using WebGPU, with a small Qwen2.5 0.5B instruct quantized model. The UI explicitly requires user action to download/load the model and does not call any paid model API.

- Initial download needs internet and can consume hundreds of MB of storage.
- Browser cache retention and iOS memory limits are not guaranteed; offline availability must be tested on an actual iPhone 17 Pro.
- Inference occurs locally once weights and runtime assets are available; first download necessarily reaches external model hosting.
- WebGPU detection is necessary but not sufficient for model compatibility. No WASM fallback is implemented.
- Model chat state currently lives in React memory, without persistence.
- The selected model ID must exist in the installed WebLLM appConfig; if the upstream catalog changes, pin the model to a supported release.
- Never claim verified iPhone compatibility until real-device tests pass.

Manual acceptance test:
1. Open Vanilla on iPhone Safari via HTTPS.
2. Check WebGPU capability, then press Download and start local AI.
3. Wait for progress to complete; ask a Traditional Chinese question.
4. Observe model answer, network traffic, memory pressure and tokens per second.
5. Test airplane mode after reload and distinguish cached-model failure from generation failure.
6. Test tab backgrounding, storage eviction and app restart.
