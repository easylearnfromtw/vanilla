# LUNA — Detroit native poster editor (v1)

## Architecture and author rights
LUNA is independently implemented as native React/TypeScript files under \`src/luna/\` and is **not** a fork of palxiao/poster-design. It borrows the broad idea of an editable visual canvas, not the third-party source, assets, models, storage schema, admin backend or account system. Nothing from the upstream service is loaded at runtime, and the original developer has **no inherited role or credentials** in LUNA.

The upstream repository is licensed AGPL-3.0; do not copy its implementation into LUNA without a legal review. This module creates original code and is intended to avoid unnecessary license coupling. Do not claim that LUNA revokes any account or permission **on the upstream website**; it only has authority over Vanilla's own module.

## Where to open
- Vanilla sidebar → **LUNA 視覺設計**.
- Detroit Studio → **LUNA 設計** → **開啟 LUNA 設計畫布**.
- Client navigation event: \`window.dispatchEvent(new Event("vanilla-open-luna"))\`.
- Detroit registry: \`{id:"luna",status:"active"}\`.

## Actual features
- Original editorial / minimal branding / event templates.
- Add/edit/reorder/duplicate/delete text, shape and imported image layers.
- Pointer drag, arrow-key adjustments, custom colors, alignment, text properties, opacity and canvas background.
- Offline keyword-to-template suggestion (not model inference).
- Browser-local autosave, separated by the signed-in email namespace or a clearly disclosed \`guest\` namespace.
- Export rendered PNG; export/import validated editable JSON.
- No server, external image service, upstream session, authentication widget or API keys.

## Security model
- All LUNA code executes in the frontend; there is no LUNA API route, privileged admin role, default username/password, server process or database.
- Imported JSON is parsed into an allow-listed immutable format: no scripts, remote images, SVG documents, arbitrary CSS or URL fields. Files and images have size limits. Images are locally decoded and re-encoded to JPEG before storage.
- Per-account browser storage keys limit accidental mixing but **localStorage is not encrypted, nor an access control barrier between people sharing an unlocked browser**. Guest projects are accessible to anybody using the same browser profile. Sensitive works should be exported to a private location and removed from that browser.
- Work is local only. PNG exports rely on browser Canvas and system fonts, so rare text line breaks and fonts may not match exactly across operating systems.
- Browser storage limits mean importing many large photos may prevent autosave; the editor reports the error, and JSON export is the recovery path.
- This is not a substitute for Vanilla's existing identity, Drive sharing policy or Athena controls. No claim of absolute protection against an independently compromised browser / third-party extension is made.

## Run
\`\`\`sh
npm install --no-audit --no-fund
npm run test:luna
npm run build
\`\`\`

No additional packages, backend deployment, passwords, secrets or environment variables are required.

## Out of scope
AI-rendered layout models, PSD import/export, advanced typography, automatic background removal, multi-user live editing, cloud templates and server-side rendering. The prompt control is explicitly identified as a deterministic offline template selector rather than a real AI generation request.

## Change rollback
Revert the PR commit(s); since LUNA uses the new \`vanilla.luna.local.v1.\` localStorage prefix, removing the module does not touch upstream applications or unrelated Vanilla projects. Existing user works remain in browser storage unless explicitly deleted; ask users to export prior to rollback if necessary.
