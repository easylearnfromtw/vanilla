# WordCraft CLI adapter for Vanilla Retina

**Status: source adapter created; disabled by default, not installed, not production-verified.**

The WordCraft project (https://github.com/storytold/wordcraft) publishes `wordcraft-cli convert input.md output.docx` and `wordcraft-cli convert input.md output.pdf`. Its CLI also provides MCP and document commands, but this adapter deliberately exposes only a fixed conversion operation. This is not an interactive Word editor or full MCP bridge.

## Routing

Vanilla PWA → Google ID token → WeiGuo verified family session (15 minutes) → explicit user upload consent → `POST /v1/family/wordcraft/convert` with `{title,body,format}` → isolated WordCraft CLI subprocess → binary response. Private Chat mode denies this remote operation; the original Retina PDF/DOCX/PPTX remains entirely on-device.

The `wordcraft_engine.py` adapter accepts only Markdown body up to 50,000 characters, title up to 120 characters, output formats `docx` or `pdf`; validates the format and output signature, limits output to 8 MiB and the subprocess to 45 s, prevents arbitrary paths or shell commands, strips process credentials and deletes its temporary directory.

## Provisioning requirements

1. Check current upstream license, NOTICE/ATTRIBUTION and pinned release. Download its correct architecture CLI from upstream releases and independently verify checksums and the expected `convert` syntax.
2. Run the CLI in a dedicated, unprivileged document-worker container / OS sandbox. Set filesystem read/write roots, block outbound network traffic, restrict CPU/memory/processes and ensure output files cannot escape the temporary working directory. The Python module does **not** implement OS isolation by itself.
3. Ensure Traditional Chinese text and fonts are available (include test samples with charts, tables, long paragraphs and symbols). Verify real DOCX and PDF output opens correctly before activation.
4. Set these **server-only** variables after the isolation tests:
   ```dotenv
   WEIGUO_WORDCRAFT_ENABLED=true
   WEIGUO_WORDCRAFT_EGRESS_ISOLATED=true
   WEIGUO_WORDCRAFT_CLI=/usr/local/bin/wordcraft-cli
   ```
   The `EGRESS_ISOLATED` variable is only an **attestation**, not a security control. Never set it to true without real network denial.
5. Retain `WEIGUO_PUBLIC_FAMILY_ONLY=true`, HTTPS, exact CORS origins, Google verified-`sub` allowlist, separate admin/session secrets and the existing per-owner isolation. Do not expose the operator bearer to the PWA.

The existing `services/weiguo/Dockerfile` copies the adapter Python module but deliberately does **not** install the WordCraft Rust binary. A normal redeploy without explicit provisioning continues to return HTTP 503.

## Verification checklist

- Run unit test `python3 -m unittest discover -s services/weiguo -p 'test_wordcraft_engine.py'`.
- Validate signed-in account authorization, private-mode UI denial and explicit upload checkbox behavior.
- Test disallowed format, bad PDF/DOCX signature, missing CLI, timeouts, oversized documents and no secret leakage.
- Confirm conversion limits and rate limit under concurrent requests, and monitor worker resource usage without logging raw document bodies.
- Test Chinese fonts and Word-compatible OOXML with real upstream release before enabling.

WordCraft is alpha; do not claim complete Office parity. Full document manipulation through its stdio MCP may be added separately with explicit read/write root policy and an allowlist of commands.
