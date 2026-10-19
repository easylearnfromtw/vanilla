# Orchestra — Detroit + Craft Suite + CREAM

> **Staged implementation**. The capability registry, Orchestra workspace, Detroit tab, and CREAM handoff are implemented in the source branch. The seven Rust executables are not bundled or deployed. Current functional outputs are local Retina DOCX/PDF/PPTX and an optional server-side WordCraft converter **only if** an operator separately installs and isolates its CLI.

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
| DeckCraft | Slides, charts and animations | PPTX, PDF, slides | Adapter contract only |
| VectorCraft | Vector illustrations/icons | SVG, PDF, PNG | Adapter contract only |
| PhotoCraft | Image layers, masking, retouching | PNG, JPEG | Adapter contract only |
| PdfCraft | PDF review, editing and operations | PDF | Adapter contract only |
| EffectCraft | Motion graphics and video composition | MP4, GIF | Adapter contract only |
| DesignCraft | Page layout and publication | PDF, PNG | Adapter contract only |

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
