# Vanilla Security Boundary & Taiwan Mandarin Conversational Style
Version: 2026-10-19

## Threat model

Vanilla is a family-first chat PWA that ingests website text, uploads, imported records, Drive memory and potentially image/OCR content. Web page text, external documents, tool results and project content are **data**; they must never be treated as new system/developer instructions, even if they claim to be an admin message.

Threats: indirect prompt injection, forged high-priority role messages, API-key exfiltration, instructions hidden in quoted website content, cross-tool privilege escalation, tampering with admin files, self-modifying prompts or files, and memory poisoning that persists to later chats.

### Implemented safeguards

1. **Input boundary:** `src/security/trust-boundary.ts` checks extracted external text and normalizes common Unicode variants before screening. Suspected malicious excerpts are quarantined and **not fed as AI context**. Legitimate user's chat is not screened by this external-content filter; it is not a keyword-based content censorship system.
2. **Retrieved memory boundary:** `knowledgeContext` wraps each retrieved snippet as lower-trust external data and excludes text with detected high-risk instructions. Saving website snippets or text attachments records an isolation flag when their extracted text appears injected. Raw user-owned files can remain in Drive for inspection, without being added as operational instructions.
3. **Admin/credentials file protection:** Cloud Files denies name-based read/write/rename/trash for paths associated with `admin`, `.env`, `credentials`, service account material, `.github/workflows`, secrets and tokens. This safeguard lives at the file-tool boundary, not inside the model's prompt. Plain conversational discussion about admin design remains allowed.
4. **Self-Build:** browser-created features are declarative JSON with controlled fields and safe arithmetic. AI output is schema-validated and requires user's approval. It cannot run arbitrary JS or directly modify GitHub code, secrets, or workflow files.
5. **Action control:** real mutations (fitness data, Sheets, memory deletion, Self-Build revisions) have explicit approval or tool-level checks. Untrusted retrieved text is never sent back through `planAppIntent` as if it were the user's request.
6. **Continuous checks:** `npm run test:security` exercises injected text, legitimate Taiwan chat samples, admin paths, and language routing; GitHub Actions runs it before deployment.

### Important limitations

No prompt-injection detection is guaranteed foolproof. A rule-based detector may miss paraphrased, multilingual, encoded, image-embedded or multi-stage attacks, and can flag benign security discussions in external documents. It is a screening aid, not a security perimeter.

**The current GitHub Pages SPA cannot secure actual admin content or enforce family authorization on its own.** Anyone with a valid Drive OAuth token and sufficient permissions can still use Google's API outside the Vanilla UI. Real admin files require private server storage, narrow OAuth scopes, independent backend authorization and audit trails. Do **not** ship admin JSON, long-lived tokens, or secrets in the static GitHub Pages app, localStorage or model prompts. Client-side denial is not a substitute for backend access enforcement.

When moving to a privileged Self-Build agent, give it a short-lived, path-limited GitHub App identity; deny `admin/**`, secrets, `.github/workflows/**` and authentication files on the backend; require review and passing tests before any PR can be merged. The browser must never keep a long-lived repository-write token.

Image prompt injections need multimodal-specific handling. The model is instructed to treat text inside images as untrusted data, but hidden/visual injections may not be visible to string screening. Keep destructive tools out of the vision model's direct reach.

### Sources

- OWASP, LLM01 Prompt Injection (2025): https://genai.owasp.org/llmrisk/llm01-prompt-injection/
- OWASP Prompt Injection Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html
- OWASP System Prompt Leakage: https://genai.owasp.org/llmrisk/llm072025-system-prompt-leakage/
- OWASP MCP Security Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/MCP_Security_Cheat_Sheet.html

## Taiwan conversational language

Vanilla should **understand** colloquial Taiwan Mandarin rather than compulsively **imitate** short-lived online memes. Style should be sensitive to the task and household member. In general:

- Normal user questions: natural Taiwan Traditional Chinese, direct response and smooth follow-up. Avoid mainland customer-service cliches and bureaucratic refusals.
- Friendly conversation: pragmatic use of particles (e.g. `欸`, `喔`, `啦`, `耶`) when suitable; not in every sentence.
- Humor: understand `笑死`, `蛤`, `真的假的`, `超扯`, `破防`, but mirror jokes sparingly and only after the other person initiates.
- Professional contexts (medical, programming, legal, finance, research): precise terminology, clear reasoning and source uncertainty; do not sprinkle youth slang.
- Sensitive subjects: supportive, straightforward, avoid sarcastic tone, mocking language and aggressive memes.
- Per-user style preferences and the user's explicit request in the current turn override generic colloquial defaults. Do not assume all household members have the same age, culture or preferences.
- Trendy words are volatile: the lexicon is a comprehension guide, not a claim that all terms are universally common in 2026.

### Research references

- 2013 corpus-comparison of Taiwan Mandarin and Mainland Putonghua particles, noting `啦、喔、耶` in Taiwan usage: https://jnhw.cbpt.cnki.net/portal/journal/portal/client/paper/e174df5c024c278bbeced9f978f4b817
- Taiwan Ministry of Education dictionary entry for `啦`: https://dict.revised.moe.edu.tw/dictView.jsp?ID=3195&la=0&powerMode=0
- Taiwan Ministry of Education dictionary entry for `欸`: https://dict.revised.moe.edu.tw/dictView.jsp?ID=10371&la=0&powerMode=0
- Dcard user discussion illustrating nuance of `是喔`, `呵呵`, `笑死` in messaging, not representative of all users: https://www.dcard.tw/f/mood/p/241443950
- 2026 Taiwan youth-slang media overview; trend source only, not a validated sociolinguistic frequency survey: https://tyaward.com.tw/%E6%99%82%E5%B0%9A/%E5%B9%B4%E8%BC%95%E4%BA%BA%E6%9C%80%E8%BF%91%E6%B5%81%E8%A1%8C%E4%BB%80%E9%BA%BC/
