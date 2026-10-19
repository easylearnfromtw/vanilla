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

## Venus × Janus 視覺協作（2026-10-20）
- **Janus**：維持本機 HTML／Unlayer JSON 匯出、檔案匯入／儲存及選用雲端編輯器。
- **Venus**：新增三種本機配色與文字排版主題（編輯、溫暖、極簡）、可見的預覽摘要、文案／CTA 檢查與 600px／360px 模擬預覽。
- Venus 檢查當前欄位的標題長度、摘要長度、內文密度、HTTPS 按鈕及 CTA 文案，**不代表**通過 Gmail／Outlook、無障礙完整標準、垃圾郵件規則、法律規範或送達率驗證。
- 變更主題不會覆蓋已儲存檔案；按「產生郵件」才套用新主題。已匯入 JSON／第三方編輯後的郵件，不會被自動判定為通過 Venus 檢查。
- 存檔格式及本機帳號分區維持向下相容；基本流程不新增外部網路依賴。
- 實作：src/venus/email-design.ts、src/email/email-templates.tsx、src/email/EmailStudio.tsx；驗證：tests/venus-email.test.mjs。

## Venus × Janus 第二階段：成品檢查與草稿一致性
- 表單檢查（文案／CTA）與 HTML 成品檢查分開呈現。後者直接根據已生成、已保存或由 Unlayer 同步的 HTML 進行 **本機啟發式檢查**，提示非 HTTPS 連結、可執行內容、未加 alt 的圖片和遠端圖片風險。**不宣稱為 HTML 安全清理器或 Gmail/Outlook 實際渲染驗證。**
- 收件匣摘要以隱藏的 preheader 寫入下載 HTML，不再重複顯示在正文；最終是否用作收件匣摘要仍取決於收件端。
- 新版草稿可選擇性保存原始欄位／模板／Venus 主題；還原草稿後同步恢復編輯畫面。舊版只有 HTML／JSON 的草稿仍可開啟。JSON-only 匯入仍必須先由雲端編輯器匯出 HTML 才能進行成品審核。
- 更換登入帳號時清除目前郵件畫面與輸入欄位，避免上一個家庭帳號的內容留在畫面。更改欄位但尚未重新生成時明確提示預覽／下載仍是舊版。
- Unlayer 同步後保留 preheader 並重新檢查同步 HTML；標示已透過外部編輯器修改，避免誤認原始表單為最新內容。
- 實作：`src/email/email-quality.ts`、`src/email/email-policy.ts`；測試：`tests/venus-email.test.mjs`、`tests/email-studio.test.mjs`。
