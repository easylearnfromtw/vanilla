# Vanilla Email Studio — Unlayer integration

## Status
The Email Studio tool appears in the left menu and supports offline/local template generation using @unlayer/react-elements (React 18 compatible), HTML preview in a script-disabled sandbox, HTML + design JSON downloads, and an explicit local save/restore workflow. It has three deterministic templates: invitation, newsletter, announcement. This is **not** AI template generation, email sending, Google Drive synchronization, or an autonomous marketing service.

## Remote editor and privacy
Unlayer React Email Editor is a wrapper around a hosted visual builder. The optional visual editor is dynamically imported **only after** clicking the opt-in button. Opening Email Studio, generating templates, importing JSON, previewing HTML, and downloading files do not initialize Unlayer's hosted editor. Clicking the opt-in button may load third-party JavaScript and transmit design contents to Unlayer. Do not use confidential, personal or medical records in this external editor.

The tool does not include Unlayer credentials or secrets, and does not silently enable paid features. Project-ID/domain setup and licensing depend on Unlayer terms.

## Workflow
1. Open Email Studio from the Vanilla tools menu, or type /郵件 in chat.
2. Choose a template and enter text. Generate offline HTML + editable Unlayer design JSON.
3. Download HTML/JSON, or save a snapshot in the current browser's localStorage.
4. If desired, explicitly enable the online drag-and-drop editor. Click Synchronize edits to update Vanilla's current HTML + JSON. Download or save again.
5. Importing JSON alone cannot render the edited HTML offline; open the visual builder and synchronize to obtain HTML. No JSON-to-JSX round trip is claimed.

Local storage is partitioned by Google account email when available. Signed-out use shares a local-device bucket; it is not a substitute for per-family-member authentication or encrypted storage, and local storage can be cleared by the browser. No Drive sync or automatic sending occurs.

## Developer notes
- UI: src/email/EmailStudio.tsx, src/email/EmailVisualEditor.tsx, src/email/email-studio.css
- Renderer: src/email/email-templates.tsx
- Pure validation and storage policy: src/email/email-policy.ts
- Navigation: src/App.tsx, src/assistant/chat-router.ts, src/local-ai/LocalChat.tsx
- Dependencies: react-email-editor and @unlayer/react-elements
- Tests: npm run test:email; npm run build
- Upstream: https://github.com/unlayer/react-email-editor and https://github.com/unlayer/elements
- Recommended future Orchestra adapter: structured, validated template fields (never arbitrary AI-generated JS); avoid executing model-produced JSX or HTML scripts; require explicit user authorization for delivery.
