# Orchestra — Detroit + Craft Suite + CREAM

> **Staged implementation**. The capability registry, Orchestra workspace, Detroit tab, and CREAM handoff are implemented in Vanilla. The seven upstream Rust executables are not bundled or deployed. Working browser outputs are Retina DOCX/PDF/PPTX, CREAM SVG, and standalone Orchestra graphic SVG/PNG/JPEG/GIF fallbacks. These browser renderers are not equivalent to native Craft binaries. Optional WordCraft and PdfCraft backends require independent operator installation.

## Why a separate skill

Orchestra is a controlled orchestration layer, not seven models or a new general-purpose LLM. Its deterministic planning separates task understanding, data validation, asset creation, export, quality assurance and file ownership, and reduces hallucinated success claims.

```text
User / Vanilla chat / CREAM
    Merlin: intent, output format and required data
      -> Zeus: deterministic Orchestra route
      -> Athena: access and remote-upload gate
      -> CREAM: verified numerical content, provenance, chart values
      -> Orchestra: WordCraft / DeckCraft / VectorCraft / PhotoCraft
                     PdfCraft / EffectCraft / DesignCraft
         (only if corresponding isolated Craft backend is verified available)
      -> Retina local DOCX/PDF/PPTX fallback
      -> Output validation / download / source- and owner-aware file storage
```

## Tool capabilities

| Tool | Task | Formats & role | Status in Vanilla |
|---|---|---|---|
| WordCraft | Document editing/typesetting | DOCX, PDF | Optional gated CLI conversion adapter; not installed by default |
| DeckCraft | Slides, charts and animations | PPTX, PDF, slides | Retina PPTX/PDF and browser slide PNG/JPEG/GIF fallback; native adapter not installed |
| VectorCraft | Vector illustrations/icons | SVG, PDF, PNG | Browser vector SVG/PNG fallback and Retina PDF; native adapter not installed |
| PhotoCraft | Image layers, masking, retouching | PNG, JPEG | Local photo brightness/contrast/saturation and export, LUNA layers separately; native adapter not installed |
| PdfCraft | PDF inspection, editing and operations | PDF | Optional fixed-argument native PDF combine adapter, off by default; no Rust binary bundled |
| EffectCraft | Motion graphics and video composition | MP4, GIF | Browser animated GIF fallback; MP4 and native compositing unavailable |
| DesignCraft | Page layout and publication | PDF, PNG | Browser PNG publication layout and Retina PDF; edit layers in LUNA; native adapter not installed |

Each upstream project provides CLI/MCP interfaces with differing command contracts. Tool names, formats and UX descriptions are **planning metadata**, not claims that an adapter is installed or a particular round-trip is production-ready.

## User-facing touchpoints

1. **Sidebar → Orchestra Studio**: select Craft category, choose supported format, enter document text, view staged route, and export locally using Retina when the format is DOCX/PDF/PPTX.
2. **Detroit Studio → Orchestra**: the same integrated tool inside Detroit.
3. **CREAM 長期分析 → Orchestra**: serialize the selected existing trend, units, observations, period, quality caveats and advice into a draft; the user reviews and optionally exports. Nothing is auto-uploaded.
4. **WordCraft (optional)**: submit title/Markdown only after explicit upload consent and verified family Google sign-in. In private chat mode, the route is disabled.

## Security and isolation

Do **not** dynamically execute manifest contents, shell commands, JavaScript or MCP tool calls based only on an LLM's assertion. Keep user content and source documents separate from instructions. Each backend should have pinned binaries, no secret-bearing process environment, a private writable temporary directory, filesystem read/write roots, blocked egress, time/CPU/memory/output limits, and explicit input ownership. Login/session tokens stay server-side or short-lived in memory on the PWA. Validate file outputs and avoid storing document bodies in audit logs.

The current WordCraft adapter provides an API and process boundaries, **not** OS-level sandboxing or binary installation. Its `WEIGUO_WORDCRAFT_EGRESS_ISOLATED=true` flag is an operator statement requiring real network isolation. Use a dedicated document worker container instead of adding seven GUI runtimes to a 1 GB Playwright process.

## Production gates, per engine

- Review upstream release version, LICENSE/NOTICE/ATTRIBUTION, architecture, build/size, and Chinese font coverage.
- Install a verified executable and test exact CLI/MCP schema (do not infer tool names).
- Exercise golden tasks with real source files, offline and with egress rules; verify image, DOCX, PPTX and PDF validity and round-trip fidelity.
- Implement explicit auth, quotas, user isolation, cancellations, audit and file retention/deletion.
- Prove success or expose failure. Never silently emit placeholders.

WordCraft-specific deployment instructions: `docs/WORDCRAFT_INTEGRATION.md` (to be completed with CLI and environment setup).

## References

- https://github.com/storytold/wordcraft
- https://github.com/storytold/deckcraft
- https://github.com/storytold/vectorcraft
- https://github.com/storytold/photocraft
- https://github.com/storytold/pdfcraft
- https://github.com/storytold/effectcraft
- https://github.com/storytold/designcraft

## Browser fallback release (2026-10-20)

All seven tool categories now have at least one **real, local output route**, without relying on cloud or pretending the upstream Craft executable was called:

- WordCraft → Retina DOCX/PDF; opt-in native converter if configured.
- DeckCraft → Retina PPTX/PDF; browser slide PNG/JPEG/animated GIF.
- VectorCraft → escaped standalone SVG or rasterized PNG; CREAM charts remain distinct.
- PhotoCraft → uploaded local PNG/JPEG/WebP is decoded on-device; bounded brightness, contrast, saturation; PNG/JPEG export. Files do not leave the browser.
- PdfCraft → Retina PDF; optional isolated PdfCraft native merge after authenticated consent.
- EffectCraft → real GIF89a animation from text. MP4 is **not supported**; not mislabeled.
- DesignCraft → PNG typography poster, Retina PDF, shortcut to existing LUNA layer editor.

Images/text are not sent to WeiGuo for these fallback operations. The GIF encoder bounds canvas dimensions and frame count; SVG output encodes text as XML data. The site requires an HTTPS origin for service worker caching, but export logic itself is offline. The native Craft sandbox, licensing review, comprehensive fidelity validation, remote execution and production smoke tests remain separate gates.
## Release verification checklist

Before publicly labeling this release available: merge the CI-green branch, verify the published PWA build marker over HTTPS, exercise actual DOCX/PDF/PPTX downloads, inspect SVG/PNG/JPEG on both narrow and wide layouts, decode exported GIF animations, confirm private mode performs no upload, and test optional backend routes only with authenticated and sandboxed production workers. Upstream seven-Craft parity and MP4 remain out of scope.

## Detroit AI native handoff

Diana proactively sends explicit document, slide, vector and motion artifact intents to Orchestra. Zeus chooses only actual browser-local engines. A request to convert the **previous AI answer** can produce a real DOCX/PDF/PPTX from Retina or SVG/PNG/GIF from Orchestra without opening the Studio. A new requirement without authored content is a brief-only job in Orchestra Studio, never a purported completed file. The Studio can prepare a safe compose prompt back in AI chat; after drafting, the user can request export of the most recent answer.

Private chats cannot send their brief to the ordinary workspace. Prior-answer local exports stay on the device. WordCraft/PdfCraft remote routes retain existing family authentication and explicit consent. Native upstream Rust executables and MP4 are not claimed deployed.

