# Vanilla Google Drive configuration

1. Create a Google Cloud project, enable **Google Drive API**, configure OAuth consent and register a **Web application** OAuth client for the exact Vanilla origin (GitHub Pages URL after deployment).
2. Request only `https://www.googleapis.com/auth/drive.appdata`. Use a browser-appropriate OAuth authorization flow with PKCE. No client secret belongs in the PWA.
3. Authorize the single storage Google account. That account can manage/remove all appDataFolder files, but cannot decrypt the three members' content without their separate secrets.
4. Each member chooses a distinct high-entropy recovery passphrase. Never upload/store passphrases or derived keys. Losing a passphrase means the ciphertext cannot be recovered.
5. Store each encrypted member snapshot separately. Do not treat a UI dropdown as member authentication.
6. Before enabling synchronization, add actual member authentication and explicit unlock, conflict handling, retention and restore verification.

Implementation status: AES-GCM encryption/decryption, IndexedDB ciphertext persistence and a token-based Drive appDataFolder transport exist. Google OAuth sign-in, unlock UI and automatic synchronization are **not** connected yet.

Important: appDataFolder is hidden application data, not an independently hosted Google database; it is not directly browsable in the Drive UI. Deleting application data can destroy backups.
