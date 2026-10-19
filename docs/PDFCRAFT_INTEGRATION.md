# PdfCraft — native PDF combine in Orchestra

**Status:** a native Linux release `v0.9.0` has passed real golden-PDF tests on GitHub Actions. The optional image `services/weiguo/Dockerfile.pdfcraft` provisions exactly that upstream CLI with both published archive SHA-256 and observed executable SHA-256 pinned. The standard Docker image remains disabled by default. Real Railway activation requires its kernel to permit rootless Bubblewrap namespaces; an unsupported sandbox must fail closed.

Source: https://github.com/storytold/pdfcraft (README documents `pdfcraft-cli combine report.pdf appendix.pdf --out combined.pdf`). The project advertises MIT OR Apache-2.0; verify LICENSE/NOTICE/asset obligations and pin a specific source commit or signed release before shipping.

## Capabilities

- User picks **2–3 PDF files**, each **at most 2 MiB**; no existing arbitrary server paths are accepted.
- PDFs are explicitly approved for HTTPS upload to the authenticated WeiGuo family backend.
- Fixed command: `pdfcraft-cli combine /tmp/…/source-1.pdf /tmp/…/source-2.pdf [source-3.pdf] --out /tmp/…/merged.pdf`.
- The worker discards inherited secret-bearing environment variables and CLI logs, enforces a global one-job semaphore and 45-second timeout, and returns PDF bytes without persisting bodies in the task DB.
- Backend output is capped at 12 MiB and must begin with `%PDF-` and contain an EOF marker near its end. This is container validation, **not** a semantic PDF parser or an AV scan.
- The backend limits each verified family account to 3 PDF combine operations per minute.

## Pinned release + Bubblewrap deployment

- Archive: `pdfcraft-cli-0.9.0-linux-x86_64.tar.gz`, SHA-256 `cdba2bec4d502d016dd78101a402d07845b708c49d77bc85e0ab640aca65372b`.
- Extracted executable: `/usr/local/bin/pdfcraft-cli`, SHA-256 `073c9c4eb4193cbbf52211d5ad8102969b0731b3294e44c47ab289ac84d2640f`.
- Independent CI workflow: `.github/workflows/orchestra-native-pdfcraft.yml`, real merger regression: `services/weiguo/native_pdfcraft_smoke.py`. The test produces three pages from two PDFs and verifies extracted text, order and structure via `pypdf`.
- Deploy optional `services/weiguo/Dockerfile.pdfcraft` **instead of** replacing the default Dockerfile. This image installs `bubblewrap` and the pinned CLI and retains its MIT / Apache 2.0 LICENSE + NOTICE.
- The native process is forcibly launched by `pdfcraft_native.py` through an unprivileged `bwrap` sandbox that requests isolated network, mount, PID, IPC and user namespaces, mounts only read-only system libraries plus the current temporary document directory, strips inherited secrets and limits CPU/file descriptors/output.
- The app probes the real kernel at startup; look for `Orchestra PdfCraft kernel sandbox: supported` in the service logs. If the probe fails, **do not enable PdfCraft**. A Docker image or CI test alone is not proof that Railway permits user namespaces.
- **Do not set** `WEIGUO_PDFCRAFT_ENABLED=true` or `WEIGUO_PDFCRAFT_EGRESS_ISOLATED=true` until that production probe succeeds. Set `WEIGUO_PDFCRAFT_SANDBOX=bubblewrap`, `WEIGUO_PDFCRAFT_CLI=/usr/local/bin/pdfcraft-cli` and the binary SHA-256 as pinned above; no user-supplied paths/MCP commands.
- No fallback directly to the unconfined CLI. Production must report unavailable if Bubblewrap cannot create the network namespace.
- For sustained/high-volume use, move this worker into a separate low-privilege container with no shared credentials/volumes and a host firewall denying egress. Native input parsers should never share the browser's ambient privileges.

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
