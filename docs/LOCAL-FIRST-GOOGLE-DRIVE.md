# Vanilla — iPhone local AI + Google Drive private data

## Product decisions
- Vanilla is an independent PWA. LINE is an optional manual import, not the main UI.
- Inference target: iPhone Safari, on-device only; do not send prompts to remote model APIs by default.
- Persistence: IndexedDB for local chats, model metadata, documents and retrieval indexes.
- Cloud: Google Drive appDataFolder for encrypted sync and backups, not inference.
- No always-on home server required.

## Implementation milestones
1. Browser capability detection for WebGPU, WASM and storage quota; fail gracefully.
2. Prototype on-device inference using a browser-compatible small quantized model; measure cold start, memory pressure, tokens/sec and offline operation on the actual iPhone.
3. IndexedDB stores scoped per-user conversations and metadata. Device identity selection is not authentication.
4. Google OAuth authorization-code + PKCE for browser client, least privilege drive.appdata; store tokens in memory where possible and handle reauthorization.
5. Encrypt all private data before upload using Web Crypto AES-GCM and a user-controlled key derived with a memory-hard KDF where available; keep key material out of Drive and GitHub.
6. Sync immutable encrypted blobs + versioned manifest; use conflict detection and recovery rather than last-writer-wins.
7. Build local RAG indexing in a worker, store encrypted document/index snapshots to Drive.
8. Implement optional LINE text-import parser with explicit user action and per-conversation consent.

## Security / limitations
- Google Drive appDataFolder is app-private storage, not a separate Google Cloud server or database. It consumes Drive quota.
- Client-only encryption cannot protect data from a compromised running client; use CSP and dependency review.
- iOS may evict site storage, terminate background tabs, or limit WebGPU and RAM; backup is essential.
- PWA installation and offline service worker must be tested on physical Safari; a web manifest alone does not enable offline.
- Do not store OAuth client secrets, plaintext family chats or encryption keys in public GitHub.
- Family isolation needs separate authenticated accounts and cryptographic keys; selecting 哲愷 / 哲緯 / 曉芬 from a dropdown is not an access control.
- Shared multi-user Google Drive sync is not equivalent to separate private user vaults. Prefer separate Google accounts or explicit sharing plus per-user encrypted vaults.

## Acceptance
- Inference succeeds in airplane mode after model assets have been cached.
- Drive receives ciphertext only; plaintext search returns no private text in uploaded blobs.
- New device can restore using Google authorization and the user's recovery secret.
- Offline changes reconcile without silently overwriting other device edits.
- User can revoke Google access and export/delete their data.
