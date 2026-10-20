# Orchestra PdfCraft — Railway on-demand Sandbox VM

This is an **alternative to a purchased VPS**, using Railway's `Sandbox`
SDK from the existing **Vanilla Detroit** project. It needs an existing
`weiguo-browser` family gateway plus a small separate HTTP broker service.

## Design

```text
Vanilla PWA → WeiGuo (family auth, quota, PDF transfer consent)
 → fixed HTTPS HMAC endpoint in pdfcraft-vm-runner
   → Railway SDK creates a fresh, isolated Linux VM (not a normal service)
      → a pinned PdfCraft v0.9.0 executable
      → Bubblewrap --unshare-net verified inside that VM
      → merge 2–3 PDFs using fixed file names, verify output
   → VM destroyed after each request, even on error
 → result delivered through WeiGuo, never stored in the task database
```

Railway Sandbox VMs are not the same as its standard containers. The latter
failed Bubblewrap's user-namespace probe on the existing host. The former
must pass its own check **before the service advertises readiness**.
Railway `networkIsolation: ISOLATED` only isolates the VM from project
private networking; it **still permits outbound internet**. The internal
Bubblewrap `--unshare-net` boundary is mandatory and must establish a
distinct Linux network namespace. No insecure fallback exists.

## Provision

1. Connect `easylearnfromtw/vanilla` to a new Railway service named
   `orchestra-pdfcraft-vm` in the **same production environment**, with
   root directory `/services/pdfcraft-vm-runner`, Dockerfile `Dockerfile`,
   health check `/health`, resource cap and exactly one process replica.
2. In Railway **Account / Workspace Settings → Tokens**, create an API token
   with access to your Vanilla Detroit project. The SDK reads **only** the
   `RAILWAY_API_TOKEN` variable; store it as a **sealed** server-side
   variable on `orchestra-pdfcraft-vm`, never on WeiGuo or the static PWA.
   This connector cannot create or retrieve that token. The existing
   `RAILWAY_ENVIRONMENT_ID` variable is injected by Railway.
   Do not use a GitHub personal access token or a frontend-exposed key.
3. Set `PDFCRAFT_VM_RUNNER_ENABLED=true` **only after** token setup.
   At boot, a real VM is created from a cached template and a pinned CLI
   digest and separate Bubblewrap network namespace are checked. The VM
   is immediately destroyed after the check. If the VM cannot be created,
   **signed** `/ready` returns 503 and no PDF jobs will run.
4. Generate one strong 64-character hex secret and set
   `WEIGUO_PDFCRAFT_WORKER_SECRET` in the VM broker and WeiGuo (server
   environment variables, not a browser bundle or GitHub commit).
5. Give this service an HTTPS `*.up.railway.app` domain. With the signed
   readiness probe returning 200, configure WeiGuo:
   `WEIGUO_PDFCRAFT_WORKER_URL=https://<broker-domain>`
   and `WEIGUO_PDFCRAFT_REMOTE_ENABLED=true`. Keep the Railway-local
   `WEIGUO_PDFCRAFT_ENABLED=false` and
   `WEIGUO_PDFCRAFT_EGRESS_ISOLATED=false` flags.
6. Test with two non-sensitive PDFs and verify pages/order. Turning off
   `WEIGUO_PDFCRAFT_REMOTE_ENABLED` on WeiGuo immediately disables the
   external transfer. Turning off `PDFCRAFT_VM_RUNNER_ENABLED` disables
   future sandbox creation.

## Cost and privacy

VM allocation is **billable**. Cached templates avoid repeated compilation
and the broker limits concurrent jobs to one and requests to three per
minute. Railway charges Sandbox VMs for CPU, memory and egress; no VM remains
running after a normal successful task, and an idle timeout is a secondary
cleanup mechanism. Avoid enabling on untrusted/public accounts. Set a
project spending limit and monitor Sandbox usage in Railway.

The worker service maintains a Railway API token; it **does not copy this
token, Google credentials or WeiGuo's admin key into the job VM**.
Only the selected PDF bytes are written to each VM, and the VM is destroyed.
No arbitrary shell commands, URLs or user-supplied filenames are forwarded.
The hosted transport still sees user-uploaded PDFs; inform users of that
processing and do not use production medical/financial files for tests.

## Verification scope

`npm test` uses a fake SDK and **never allocates a billable VM**. CI checks
the broker Docker image. This does **not** replace the live boot-time
namespace and native merge acceptance check. The on-demand design is not a
guaranteed 47-second cold start; the first cached-template build may be
slow. Retain opt-in and safe 503 errors until a production VM probe passes.

Official Railway docs: https://docs.railway.com/sandboxes
