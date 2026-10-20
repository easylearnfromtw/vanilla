# Canva Cloud Studio — optional Detroit / Orchestra API adapter

## Scope and honest status

This change adds **source code** for an optional Canva preview API bridge; it does **not** connect a Canva account, deliver production OAuth onboarding, install a Canva backend, consume credits, or prove live Canva generation. It stays disabled until the operator explicitly configures the gateway.

- **Text → AI image**: POST `/rest/v1/image-generations`, poll GET `/rest/v1/image-generations/{jobId}`; download URL expires after 24 hours. Scope `asset:write`.
- **Text → editable Canva presentation**: POST `/rest/v1/generations` with the `presentation` preset; poll GET `/rest/v1/generations/{jobId}`; resulting design is saved in the token owner's Canva account, with a temporary edit URL (30 days). Scope `design:content:write` and **Canva `design_generation` capability**.
- These are **preview endpoints**. Canva states that public integrations using preview APIs cannot pass public app review, and requests may change without versioning. The operator's account must have the AI credits/capabilities required by Canva.
- Does not yet export the editable Canva result to PPTX or download generated image bytes into LUNA; users follow returned Canva links. Local Retina PPTX and LUNA PNG remain separate fallbacks.
- Canva API credentials for the ChatGPT Canva connector cannot be reused automatically by a third-party Vanilla backend.

Official API references:
- https://www.canva.dev/docs/apps/rest-apis/reference/generations/create-image-generation-job/
- https://www.canva.dev/docs/apps/rest-apis/reference/generations/get-image-generation-job/
- https://www.canva.dev/docs/apps/rest-apis/reference/generations/create-design-generation-job/
- https://www.canva.dev/docs/apps/rest-apis/reference/generations/get-design-generation-job/

## Architecture

```
Vanilla chat / @Canva (Diana chooses optional tool)
    → Orchestra Studio → CanvaPanel (explicit one-off cloud consent)
    → existing WeiGuo family login + owner role
    → /v1/family/canva/status (capabilities: configured only, not actual entitlement)
    → /v1/family/canva/generate (bounded job with validated body)
    → Canva official HTTPS REST API (backend-only Bearer OAuth access token)
    → /v1/family/canva/jobs/{kind}/{uuid} (only submitting account may poll)
    → actual URL shown only after Canva reports success
```

`Athena` privacy gate: no Canva API in private chat mode; user must explicitly check the one-off consent box. Changing a prompt/type clears consent. The Canva credential and the WeiGuo operator token are never rendered into the public PWA and must not be committed to GitHub.

## Operator setup — prototype

1. Register a Canva developer integration and authorize a Canva user via **Canva's OAuth 2.0 workflow**, requesting `asset:write` and `design:content:write` as appropriate. Ensure the authorized user has `design_generation`, AI credits and private preview access. Do not paste client secrets or access tokens into Vanilla's public GitHub Pages JavaScript, a GitHub issue, or this chat.
2. Deploy or update the existing private/family `services/weiguo` Python gateway using the updated Dockerfile (or `Dockerfile.pdfcraft`). Configure existing `WEIGUO_CORS_ORIGINS`, `WEIGUO_GOOGLE_CLIENT_ID`, `WEIGUO_SESSION_SECRET`, `WEIGUO_FAMILY_ACL_JSON`, and a separate HTTPS origin as already documented by WeiGuo.
3. Provision the server secret `WEIGUO_CANVA_ACCESS_TOKEN` **only on the backend**, using a currently valid OAuth user token. Set `WEIGUO_CANVA_ENABLED=true` to opt in. The default is false, and token presence alone does not enable use. This prototype **does not refresh tokens**: Canva access tokens are short-lived and the operator must replace them securely until a true OAuth refresh/vault/consent lifecycle is implemented.
4. In Vanilla, log in to the same Google account used for the WeiGuo family role, verify as `owner`, and open **Orchestra Studio → Canva Cloud Studio**. Use **Check Canva connection**, select image/presentation, review prompt, check consent and submit; manually refresh the job status.
5. To disable: set `WEIGUO_CANVA_ENABLED=false`, redeploy and revoke/rotate the OAuth credential from your identity provider. `configured=true` is only a deployment signal, not a proof of Canva API access. Test an actual generation in an authorized account before declaring production readiness.

## Security / operational boundaries

- **Identity**: requires a signed WeiGuo Google family token with `owner` role; not merely a browser origin or model assertion.
- **Data minimization**: this version only sends text prompts to Canva. No prior chats, Drive files, images or attachments are sent automatically.
- **Validation**: only `image` or `presentation` generation; 3–5000 characters; allowlisted image aspect ratios; fixed Canva HTTPS API endpoints; no user-provided URLs; no redirects; fail closed on invalid response. Image/model cost is on Canva, not OpenAI or Vanilla.
- **Quota**: 2 submissions/minute (per single-worker gateway), before Canva's own limits. No prompt bodies or OAuth secrets in standard request logs; LUCA should record status and latency only.
- **Jobs**: a short-lived in-memory mapping binds each accepted job UUID to the creator's Google `sub` and task kind, expires after 24 hours. Restarting WeiGuo loses the mapping; use Canva account UI to recover created designs. Multi-replica deployments require a durable encrypted job store. This is **not a production OAuth multi-tenant backend**.
- **Access links**: image CDN URLs and Canva edit URLs are temporary. No unconditional `success` when the Canva API only returned `in_progress`.
- **Publishing**: Canva preview endpoints cannot be used for a public reviewed integration per Canva's published policy. Obtain eligibility/legal review and replace this preview-only prototype before any commercial public rollout.

## Validation

```sh
npm run test:diana
npm run test:orchestra
npm run build
cd services/weiguo
python3 -m unittest test_canva_adapter.py
```

Repository CI also runs WeiGuo's `test_*.py` suite. These tests **mock all Canva network calls**, so passing them does not establish live Canva API availability. Deployment smoke tests must separately cover Canva entitlement, OAuth scope, refresh expiry, job completion, image link opening, presentation edit link opening, 401/403/429, cross-owner denial and private mode.
