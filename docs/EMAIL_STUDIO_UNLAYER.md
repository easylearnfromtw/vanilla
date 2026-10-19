# Janus — Detroit Email Design Tool (formerly Email Studio)

## Status
Janus is registered as a Detroit data/output engine. It is accessible from the Detroit Studio Janus tab and the former Email Studio left-menu shortcut (now labeled Janus) and supports offline/local template generation using @unlayer/react-elements (React 18 compatible), HTML preview in a script-disabled sandbox, HTML + design JSON downloads, and an explicit local save/restore workflow. It has three deterministic templates: invitation, newsletter, announcement. This is **not** AI template generation, email sending, Google Drive synchronization, or an autonomous marketing service.

## Remote editor and privacy
Unlayer React Email Editor is a wrapper around a hosted visual builder. The optional visual editor is dynamically imported **only after** clicking the opt-in button. Opening Email Studio, generating templates, importing JSON, previewing HTML, and downloading files do not initialize Unlayer's hosted editor. Clicking the opt-in button may load third-party JavaScript and transmit design contents to Unlayer. Do not use confidential, personal or medical records in this external editor.

The tool does not include Unlayer credentials or secrets, and does not silently enable paid features. Project-ID/domain setup and licensing depend on Unlayer terms.

## Workflow
1. Open Detroit Studio → Janus (or its dedicated sidebar shortcut), or type /Janus or the legacy /郵件 in chat.
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

## Detroit integration
- Engine ID `janus` (active): deterministic local email HTML/design JSON rendering, hosted visual editing only after explicit user consent, no automatic sending.
- The former Detroit source-verification role previously called Janus is now `veritas` (adapter) to avoid an engine-name collision; source checking remains separate.
- `merlinParse` routes email template requests to a Janus planning stage; this does **not** by itself generate mail inside chat or send messages.
- `src/detroit/janus.ts` enforces a pure permission gate; private mode denies the hosted editor and sending is never implemented.
- Existing drafts continue using `vanilla.email-studio.v1` storage keys to preserve backward compatibility.
