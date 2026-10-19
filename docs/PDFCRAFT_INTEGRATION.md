# PdfCraft — native PDF combine in Orchestra

**Source status:** an opt-in PdfCraft CLI adapter and authenticated Orchestra UI are implemented. **The external Rust binary is not installed by this change**, and no native rendering is claimed until a real isolated deployment completes golden-file tests.

Source: https://github.com/storytold/pdfcraft (README documents `pdfcraft-cli combine report.pdf appendix.pdf --out combined.pdf`). The project advertises MIT OR Apache-2.0; verify LICENSE/NOTICE/asset obligations and pin a specific source commit or signed release before shipping.

## Capabilities

- User picks **2–3 PDF files**, each **at most 2 MiB**; no existing arbitrary server paths are accepted.
- PDFs are explicitly approved for HTTPS upload to the authenticated WeiGuo family backend.
- Fixed command: `pdfcraft-cli combine /tmp/…/source-1.pdf /tmp/…/source-2.pdf [source-3.pdf] --out /tmp/…/merged.pdf`.
- The worker discards inherited secret-bearing environment variables and CLI logs, enforces a global one-job semaphore and 45-second timeout, and returns PDF bytes without persisting bodies in the task DB.
- Backend output is capped at 12 MiB and must begin with `%PDF-` and contain an EOF marker near its end. This is container validation, **not** a semantic PDF parser or an AV scan.
- The backend limits each verified family account to 3 PDF combine operations per minute.

## Required deployment gates

Build or obtain a reviewed `pdfcraft-cli` for the target CPU/OS and confirm the exact documented `combine ... --out ...` invocation with **real PDFs**. Review upstream dependencies and comply with all applicable licenses. A binary digest alone does not establish its trustworthiness.

Run this operation in a dedicated low-privilege worker with **real** filesystem access limits and outbound network denial. Never rely on an environment flag for sandboxing. Establish CPU, memory, file, output and runtime limits at the process/host level. Test encrypted PDFs, corrupted and intentionally adversarial input before considering production use. The default WeiGuo Playwright image **does not** enforce the necessary per-process isolation.

Only after these checks should the operator set the following *server-side* configuration:

```env
WEIGUO_PDFCRAFT_ENABLED=true
WEIGUO_PDFCRAFT_EGRESS_ISOLATED=true
WEIGUO_PDFCRAFT_CLI=/usr/local/bin/pdfcraft-cli
WEIGUO_PDFCRAFT_SHA256=<verified-64-hex-sha256>
```

The EGRESS_ISOLATED value only attests to a separate firewall/sandbox that **must already exist**. Never set it to true on an ordinary unrestricted Railway instance.

## API

`GET /v1/family/orchestra/capabilities` — verified short-lived family login; returns `pdfcraft: configured` only when its independent SHA/policy gate passes, with `operations: ["combine-pdf"]`, `outputFormats: ["pdf"]`, `runtimeVerified: false`.

`POST /v1/family/orchestra/pdfcraft/combine` — same family authorization. JSON `{"files":["<standard Base64 PDF 1>","<standard Base64 PDF 2>"]}`; return `application/pdf` attachment, `Cache-Control: private, no-store`. Always require upload consent in the Vanilla UI.

A capability marked configured is not a claim of full PdfCraft feature availability: split, text extraction, annotation, OCR, user-supplied file paths and arbitrary MCP tools are **not** exposed through this adapter.

## Testing

- Offline: `python3 -m unittest discover -s services/weiguo -p 'test_pdfcraft_engine.py'`
- All Python gateway tests: `python3 -m unittest discover -s services/weiguo -p 'test_*.py'`
- Node regression tests: `npm run test:orchestra`
- App typecheck and build: `npm run build`

Real golden-file test still required with a pinned PdfCraft binary and Traditional Chinese PDF samples. Ensure merge order is preserved and the output opens correctly in multiple PDF viewers.

Plan subsequent adapters for DeckCraft, VectorCraft, PhotoCraft, EffectCraft and DesignCraft separately with pinned, verifiable native commands; never construct arbitrary CLI or MCP tool calls from model text.
