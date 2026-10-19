# Erya Humanize — Vanilla / Detroit / Orchestra

## Scope and provenance

Erya Humanize is an **original TypeScript feature** informed by the structure-first editing concept of [lynote-ai/humanize-text](https://github.com/lynote-ai/humanize-text) (MIT). No upstream source, trained model weights, Google Translate, Niutrans, API calls, or proprietary Lynote API are bundled or invoked. We make **no detector-bypass or semantic-equivalence claims**. This integration is designed to improve readability, not misrepresent authorship.

## How to use

- In Vanilla chat: `/潤稿 原文` or `/humanize 原文`.
- Natural language: `請幫我把這段文章寫得更自然：... ` / `潤稿：...`.
- Orchestra Studio (also embedded in Detroit Studio): paste content and select **爾雅 Erya · 送至聊天潤稿**. Vanilla opens a prefilled **unsent draft**; inspect it, choose your model/privacy mode, and press Send yourself.

Single-request upper bound is 8,000 characters; longer content must be split manually. If no source text is supplied, the model should ask for the source.

## Architecture

1. Merlin recognizes an explicit rewrite task and sets a standard Detroit pipeline instead of treating it as a quick generic answer.
2. Zeus reuses the **existing selected local WebLLM, optional user-configured Ollama, or explicitly consented cloud provider**. Erya does not instantiate a second model, translate across languages, or call Lynote.
3. Erya provides lower-priority style and integrity instructions (Taiwan Traditional Chinese, preserve tone and important meaning). The text being edited is lower-trust content, not instructions to run tools, leak data or change policy.
4. The selected model generates a rewrite. While generating, Erya-specific drafts do not display unverified partial text. A deterministic postprocessing check verifies literal placeholders, URLs, DOI strings, citation labels, numbers and code fences.
5. If machine-checkable items disappear, or output is empty or grossly shortened, the candidate is **not accepted**; the original is presented with a warning. Successful outputs remain generated text, **not facts audited by CREAM**.
6. Orchestra handoff stores the draft only temporarily in same-tab `sessionStorage`, removes it on chat mount, and **never automatically submits**. Backend export continues to use the existing separate permission controls.

## Privacy and limitations

- In Private Mode, Vanilla's existing model router stays local-device only. The humanizer introduces **zero** additional network requests, third-party libraries or API keys.
- Outside Private Mode, standard Vanilla model routing and its cloud/Ollama consent prompts still apply. The draft is not transmitted until the user sends it.
- The deterministic checker detects literal-value loss; it cannot prove factual equivalence, faithful tone, correct translations of numbers, or preservation of every clinical/legal nuance. Always review sensitive documents.
- The upstream's new SFT/KTO training-data pipeline is **not** a pre-trained offline model and is not claimed to be deployed here.
- This feature is text generation and validation, not background learning, detector evasion, or a new standalone model.

## Verification

```sh
npm run test:erya
npm run test:detroit
npm run test:chat-router
npm run test:orchestra
npm run build
```

CI runs `test:erya` as part of its regression suite.
