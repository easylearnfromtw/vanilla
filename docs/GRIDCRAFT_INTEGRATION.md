# Vanilla Sheets × GridCraft — phase 1 adapter

Implementation branch: `feat/gridcraft-vanilla-sheets`.

## Contract

GridCraft is a separate **optional**, headless backend engine. Vanilla's existing
`src/workspace/Sheets.tsx` remains the editable phone UI; CREAM still owns
deterministic stats/chart interpretation; Zeus dispatches actions; Athena
enforces the allowlist; the family-authenticated WeiGuo backend executes the
actual `gridcraft-cli` command. **No GridCraft binary ships in this repository.**

- `POST /v1/family/gridcraft/xlsx` with a short-lived WeiGuo family bearer.
- Request: `{"cells":[{"cell":"A1","input":"月份"},{"cell":"B1","input":"營收"},{"cell":"B2","input":"=SUM(1,2)"}]}`.
- Response: `{filename, xlsxBase64, cellCount, scope:"active-sheet-only"}`.
- Only owner/member roles can submit; viewer and unauthenticated users are denied.
- Only the active Vanilla Sheets tab is exported. No existing XLSX is opened,
  edited or overwritten. No workbook is stored by the backend.
- Explicit upload confirmation in the PWA precedes sending cell contents.
- Bounds: A1:Z200, 500 nonempty cells, 120 KB UTF-8 content, 3 MB output,
  25 seconds. Export supports cell text/numbers and a small allowlisted
  formula subset. Fonts/charts/multi-tab compatibility are **not** claimed.

## Enable on a trusted backend

1. Build or install a verified, pinned revision of [GridCraft](https://github.com/storytold/gridcraft)
   and make `gridcraft-cli` executable on the **WeiGuo backend PATH**.
   Do not compile upstream code dynamically in a public request.
2. Set `WEIGUO_GRIDCRAFT_ENABLED=true` **only after** verifying the binary.
   Default is `false` and returns HTTP 503.
3. Keep `WEIGUO_GOOGLE_CLIENT_ID`, `WEIGUO_SESSION_SECRET` and server-side
   `WEIGUO_FAMILY_ACL_JSON` private. Use TLS, existing family authentication,
   egress isolation and low-privilege container access.
4. In Vanilla, use WeiGuo's Google login first, then go to Vanilla Sheets and
   choose **GridCraft XLSX**. The button sends only the current tab after a
   confirmation prompt and downloads an editable workbook.
5. Run tests: `cd services/weiguo && python -m unittest test_gridcraft_adapter.py`.
   A real binary integration test is still required before production use.

## Remaining implementation

- The current grid is not GridCraft WASM; it is the existing Vanilla Sheets
  editor. No real-time collaboration or live bidirectional workbook sync.
- Add GridCraft MCP tool routing only after independently securing and testing
  per-command permissions, per-user isolation and output validation.
- Build and validate pinned GridCraft binaries across target backend architectures.
- Validate formula/XLSX compatibility and chart parity against real GridCraft
  releases before expanding the formula allowlist or enabling chart commands.
- Eventually consider embedded WASM editing, full workbook round-trips and
  long-running Persistent Jobs, but do not represent those as working yet.

Official upstream references:
- https://github.com/storytold/gridcraft/blob/main/docs/cli.md
- https://github.com/storytold/gridcraft/blob/main/docs/mcp.md
- https://github.com/storytold/gridcraft/blob/main/docs/architecture.md
