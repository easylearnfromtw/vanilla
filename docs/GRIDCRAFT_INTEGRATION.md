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

## CREAM ↔ GridCraft report (follow-up, 2026-10-20)

The chat-embedded CREAM result now offers **GridCraft 專業 Excel** for signed-in
family members in normal mode. This is *not* a replacement for the local CREAM
deterministic engine, nor an unrestricted agent / MCP endpoint.

### What the real integration produces

- Fixed server-constructed GridCraft CLI `range.setValues` command writes an
  editable Excel worksheet containing the descriptive statistics **already
  calculated by CREAM** for all its numerical metrics.
- A plot data section preserves the selected metric's original CREAM source row
  numbers and displays up to 48 points — the same preview shown in chat.
- GridCraft `insert.chart` creates a native Excel column/line/pie/scatter
  chart for compatible nonnegative, correctly paired data. Repeated categories
  are merged for pie charts. Negative pie values and number lines do not get a
  falsely equivalent chart; the XLSX retains the quantitative preview without
  a chart.
- GridCraft also creates live `SUM` and `AVERAGE` worksheet formulas over the
  **preview** rows. Do not confuse those with full-sample CREAM statistics.
- Nonempty workbook content is **not** uploaded automatically. The browser
  asks for one-time confirmation explaining exactly what leaves the device:
  statistics summary + source + selected chart preview, but not complete raw
  CSV/XLSX or all rows. The result downloads locally as an XLSX.
- In private mode, the backend action is disabled. The backend requires the
  same short-lived Google family token and rejects `viewer` role.
- Local CREAM charts and CSV summaries continue to work offline / without
  GridCraft, so backend failure does not change CREAM calculations.

### API / safety

`POST /v1/family/gridcraft/cream-report`, governed by
`WEIGUO_GRIDCRAFT_ENABLED=true` and the existing family OIDC session. A
request contains `source`, `rowCount`, `metrics`, `focusKey`, `points`,
`chartKind`. No user-supplied shell arguments, binary paths, file paths,
execution commands, URLs or arbitrary formulas are accepted. Only the verified
GridCraft CLI binary executes server-generated commands in a fresh temp
directory with scrubbed environment and timeout.

Upstream commands verified against GridCraft:
- `range.setValues`, `home.bold` and `insert.chart`
- https://github.com/storytold/gridcraft/blob/main/docs/cli.md
- https://github.com/storytold/gridcraft/blob/main/docs/mcp.md

### Deployment + validation

The GridCraft CLI binary is still **not bundled** in WeiGuo Docker.
`WEIGUO_GRIDCRAFT_ENABLED` defaults to false. The previous deployment steps
remain necessary: build and pin a reviewed upstream binary, install on a
trusted private backend, validate real XLSX/chart round-trip, then opt-in.
Do not represent frontend CI passing as production GridCraft being available.

Tests:
```sh
npm run test:cream-gridcraft
python3 -m unittest discover -s services/weiguo -p 'test_*.py'
```

Remaining scope: do not claim full 3,000-row XLSX export, full-data GridCraft
statistical revalidation, arbitrary chart types, mobile WASM editor,
multi-sheet sync, or unattended agent execution. They require separate
development, resource testing and privacy review.

## Railway production installer (2026-10-20)

`services/weiguo/Dockerfile` now compiles the real `gridcraft-cli` from the
GridCraft **v0.8.0** tag pinned to upstream commit
`823c56582d00be91e31b4f7f3680496cf89e84fb`, with `cargo --locked` in
a dedicated Rust 1.90 build stage. The runtime only receives the CLI binary,
not the Rust compiler or upstream source. A mismatched release tag fails the
build instead of silently adopting new source code.

The Docker build first smoke-tests native `insert.chart` using
`gridcraft-smoke.jsonl`, then runs `gridcraft-smoke.py` against the actual
WeiGuo `gridcraft_adapter._render` for Sheets XLSX, CREAM report/chart,
SUM/AVERAGE preview formulas, and spreadsheet formula-injection resistance.
Any failure blocks the new image from deployment. Railway service:
`Vanilla Detroit / weiguo-browser`, with root `/services/weiguo` and
existing Google family authentication/ACL unchanged.

**Activation:** Deploy and verify the new image first. Only after the build's
real smoke test and Railway health check succeed, set the Railway service
variable `WEIGUO_GRIDCRAFT_ENABLED=true` and apply/deploy it. The flag
remains false by default; a source change or a CI pass does **not** activate
the endpoint on an old deployed image.

**Access:** In non-private Vanilla mode, sign in to Drive and WeiGuo with the
same approved Google account; request a CREAM analysis and use
**GridCraft 專業 Excel**. Confirm the one-time upload of statistics and up to
48 preview points. This exports an editable XLSX with chart where supported;
it does **not** transmit raw whole datasets or independently recompute CREAM
statistics. Backend logs and exported files must not contain OIDC secrets.
