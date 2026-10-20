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

## Qwen3 0.6B stuck at "Start to fetch params"

The pinned WebLLM 0.2.82 catalog contains `Qwen3-0.6B-q4f16_1-MLC`.
Its weights are hosted at `https://huggingface.co/mlc-ai/Qwen3-0.6B-q4f16_1-MLC`
and are larger than the Qwen2.5 0.5B download.

A callback that repeatedly says "Start to fetch params" is **not proof of a successful download**. The worker now checks *increasing numeric progress* and stops after 180 seconds of no advancement, without treating a network stall as a broken iPhone worker. A 30-second warning explains that it is awaiting weights. A true progress increase resets the timer; slow active downloads are allowed to continue.

Recovery:
1. Confirm the browser can access the model repository on Hugging Face; try a stable Wi-Fi network and sufficient available device storage.
2. Retry the selected local model.
3. If it still stalls, use the model panel's **清除這個模型的快取後重試**, then explicitly download it again. This only purges the selected model's weight shards/tokenizer; it does not remove chat transcripts or other models.
4. For urgent conversations, choose Qwen2.5 0.5B or an already connected remote provider. No alternate mirror or cloud upload happens without the user's action.

LUCA classifies the `model-download-stalled` event as a timeout without persisting raw errors, model names, URLs, or prompts.
The fix is a defensive timeout/repair path; it does **not** establish that the real iPhone download has succeeded. Verify on the user's device.
