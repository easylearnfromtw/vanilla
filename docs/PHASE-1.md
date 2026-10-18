# Phase 1 — Independent Vanilla UI

## Product boundary
Vanilla is a standalone family AI interface. LINE is an optional import connector and must never become the primary navigation or identity provider.

## Acceptance checks
- TypeScript compilation and Vite production build pass on GitHub Actions.
- All eight primary sections are navigable on mobile.
- No personal information or LINE transcript is stored in GitHub Pages assets.
- Chat is explicitly labeled prototype until authenticated model gateway is connected.
- Identity selection is UI only and is not an authorization mechanism.

## Next implementation
1. Authenticated FastAPI gateway with household-scoped authorization.
2. Ollama-compatible model endpoint behind private access.
3. Server-backed conversation storage and task persistence.
4. Secure import queue for optional LINE exports.
5. Service worker and validated offline mode; manifest alone is insufficient.

## Deployment warning
Do not merge or enable public deployment for sensitive use until authentication, access controls, and privacy review are complete.
