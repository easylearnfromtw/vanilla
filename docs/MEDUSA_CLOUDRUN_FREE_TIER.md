# Medusa Cloud Run Sandbox — low-cost cloud executor

**Code implemented; Google Cloud provisioning required.** This is the second
Medusa execution engine alongside the existing Judge0 adapter. It does **not**
claim to be always free, never sends API secrets to the iPhone, and does not
enable execution simply by merging into GitHub.

Sources:
- [Code execution / sandboxes](https://docs.cloud.google.com/run/docs/code-execution)
- [Configure for Cloud Run services](https://docs.cloud.google.com/run/docs/configuring/services/sandboxes)
- [Cloud Run billing](https://cloud.google.com/run/pricing)
- [Cloud Run spend caps](https://docs.cloud.google.com/run/docs/configuring/billing-settings)

## Architecture

Vanilla PWA → WeiGuo family OIDC and allowlisted owner → Medusa engine router
→ HTTPS Cloud Run worker → `/usr/local/gcp/bin/sandbox do`
→ isolated Python → bounded stdout/stderr → Vanilla.

Cloud Run worker is kept in `services/medusa-cloudrun/`, with its own
Dockerfile, minimal service identity, FastAPI Bearer verification and exactly
two private-use HTTP routes: GET `/v1/status` and POST `/v1/execute`.

**Never execute Python directly in the worker's host process or Railway.**
The worker rejects requests unless `K_SERVICE`, the real Sandbox Launcher
binary, and an independent secret are present. The subprocess command is
`sandbox do --sandbox-name <random> -- /usr/local/bin/python3 -I -B -c <source>`.
There is no `--allow-egress`, no `--write`, no user-supplied paths,
no arbitrary commands, no files mounted or exposed. Host and sandbox are
separate processes and sandboxes are ephemeral. Google's default sandbox
filesystem includes read-only access to the service image: **do not put
secrets in image files**. Avoid sensitive source or stdin: code execution and
submission may still expose data to the infrastructure operator.

## Deploy (requires your Google Cloud project, enabled billing & permissions)

1. Create/select an isolated Google Cloud project with billing enabled.
   Deploying *may incur charges* for Cloud Build, Artifact Registry,
   Cloud Run, logs or outbound traffic. Free quota is not a hard guarantee.
2. Configure [Cloud Run spend caps](https://docs.cloud.google.com/run/docs/configuring/billing-settings),
   if available for your billing account and region, as well as budget alerts.
   **An alert-only budget is not a cap.** Use a small capped test project;
   enforce `max-instances=1`, `min-instances=0`, 1 vCPU, 512 MiB,
   1 concurrency, 20 seconds per request. Monitor usage after deploying.
3. Install gcloud SDK, authenticate as project owner, enable required
   `run.googleapis.com`, `cloudbuild.googleapis.com` and
   `artifactregistry.googleapis.com` APIs, and confirm sandbox preview
   is supported in your region.
4. From a trusted shell:
   ```bash
   export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"
   export GOOGLE_CLOUD_REGION="us-central1"
   # Generate a random 48+ character bearer token; never paste it into GitHub.
   export MEDUSA_CLOUD_SHARED_SECRET="$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')"
   bash services/medusa-cloudrun/deploy.sh
   ```
   The script deploys via Google's `gcloud beta run deploy --sandbox-launcher`,
   creates a separate minimally privileged runtime identity, and uses a
   temporary restricted env-var file. Keep its printed HTTPS `*.a.run.app` URL.
   **Cloud Run is deliberately exposed with `--allow-unauthenticated` for the
   cross-cloud HTTPS gateway, but the application rejects missing/invalid
   48+-character bearer tokens.** This is not the same as Google IAM-only
   ingress. Public invalid requests can still consume billable resources.
   Never post the bearer token or Cloud URL with credentials publicly.
5. Independently test worker behavior from a trusted authenticated machine:
   ```bash
   curl --fail-with-body -sS "$MEDUSA_CLOUD_RUN_URL/v1/status" \
     -H "Authorization: Bearer $MEDUSA_CLOUD_SHARED_SECRET"
   curl --fail-with-body -sS "$MEDUSA_CLOUD_RUN_URL/v1/execute" \
     -H "Authorization: Bearer $MEDUSA_CLOUD_SHARED_SECRET" \
     -H "Content-Type: application/json" \
     --data '{"source_code":"print(42)","stdin":""}'
   ```
   Expected: `{"backend":"cloudrun-sandbox","ready":true,...}` and a
   **real** `stdout: "42\\n"`. Then independently test timeout, output
   overflow and blocked outbound network. Do not enable until verified.
6. Configure the **existing Railway WeiGuo service** (server-side only):
   ```dotenv
   MEDUSA_ENGINE=cloudrun
   MEDUSA_ENABLED=true
   MEDUSA_CLOUD_RUN_VERIFIED=true
   MEDUSA_CLOUD_RUN_URL=https://medusa-cloud-<generated>.a.run.app
   MEDUSA_CLOUD_SHARED_SECRET=<same independent token as Cloud Run>
   MEDUSA_FAMILY_ENABLED=true
   MEDUSA_FAMILY_OWNER_SUBS=<verified owner Google OIDC sub>
   ```
   `MEDUSA_CLOUD_RUN_VERIFIED` is a **manual attestation**, not an isolation
   mechanism. `MEDUSA_SANDBOX_EGRESS_BLOCKED` and
   `MEDUSA_PYTHON_LANGUAGE_ID` are Judge0-only fields, not applicable here.
   Do not expose any of these in `VITE_*` or the static PWA.
7. Open Detroit Studio → Medusa on the PWA; a signed-in allowlisted family
   owner explicitly approves each run. Viewer/member requests and private
   conversations remain blocked. Real runtime values are sent back by the
   Cloud Run worker. No agent-triggered automatic code execution exists.

### Operational limits

- Source <= 16 KB UTF-8; stdin <= 2 KB; 6-second worker timeout;
  4 KB max stdout and stderr each; 1 worker process / instance.
- The family gateway permits 3 runs per owner per minute per WeiGuo process.
  Use a shared production rate limiter and external abuse controls before
  making this multi-tenant or offering the service commercially.
- Cloud Run instances may cold-start; request duration and Cloud Build
  or image storage can still produce costs, especially beyond free quotas.
- Sandboxes deny egress **by default** and do not inherit host environment
  variables. Keep the worker image free of embedded credentials or user files.
- Since the deployment uses public HTTPS with a strong shared bearer secret
  rather than Cloud Run IAM, anyone can send unauthenticated requests that
  consume request-processing resources. This is **not a hard zero-cost setup**.
- Roll back instantly by setting `MEDUSA_ENABLED=false` or
  `MEDUSA_FAMILY_ENABLED=false` in Railway; optionally disable or delete
  the Cloud Run service and revoke/rotate the shared token.

## What has NOT been completed solely by source integration

No Google Cloud project, billing relationship, Google Cloud deployment, or
real isolated `print(42)` run can be presumed. A CI mock proves API and
auth contracts only. User-initiated cloud account provisioning is required.
