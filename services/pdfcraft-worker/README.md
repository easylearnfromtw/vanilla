# Vanilla Orchestra · independent PdfCraft Linux worker

A deployable **dedicated Linux node** for the existing Vanilla family
`Orchestra Studio → WeiGuo → PdfCraft` workflow. The backend never grants the
browser or the AI model a shell, arbitrary file access or a native-tool argument.

```text
iPhone Vanilla PWA (explicit upload consent)
  → WeiGuo family HTTPS gateway on Railway (Google identity + 3/min quota)
    → HTTPS, request-bound 256-bit HMAC (timestamp/nonce, no redirects)
      → reverse proxy on owned Linux VM (443 → localhost:8090)
        → non-root PdfCraft worker (single process)
          → checksum-pinned pdfcraft-cli inside Bubblewrap
               network/PID/mount/user namespace isolation
               only a private temporary PDF workspace
```

**Status:** Source and offline gateway/worker tests are provided. A dedicated
Linux VM, DNS name, trusted TLS certificate and operator-provided secret **are
not** supplied by this repository. Do not claim the worker is online until
`GET /v1/family/orchestra/capabilities` reports the remote worker online
after a signed readiness probe. Railway's existing embedded Bubblewrap mode
was observed to fail its kernel admission test; never disable that safety gate.

## VPS launch checklist (production preparation)

This installation pattern follows the Linux sandbox troubleshooting seen in
projects such as `anthropics/sandbox-runtime`, `styin/kaguya` and Codex:
**test user namespaces first**, use the distribution-supplied narrowly scoped
Bubblewrap AppArmor profile when necessary, and keep global AppArmor controls
enabled. Your present standard Railway `weiguo-browser` container failed the
rootless Bubblewrap admission probe. A Railway **Sandbox VM** is a different
product and its compatibility cannot be inferred from that failure.

The template is **provider neutral**. Choose a Linux **x86_64 Ubuntu 24.04**
VPS (2 vCPU; 4 GB RAM recommended, 2 GB minimum) from a provider you trust.
Do not buy a machine with ARM-only architecture for this pinned CLI release.
In its VPS setup interface:

1. Inject an SSH public key, disable SSH passwords, and optionally supply
   [`cloud-init.example.yaml`](cloud-init.example.yaml) as user data.
   It installs only OS prerequisites, never credentials or the worker service.
2. Keep SSH access restricted to the operator. Permit HTTPS **443** and
   temporary **80** for automatic TLS certificate issuance as needed.
   Do **not** expose port **8090**. Verify firewall rules before applying them
   to prevent locking yourself out.
3. Point an operator-controlled DNS name (e.g., `pdfcraft.your-domain.example`)
   at the VPS and wait until TLS resolves correctly.
4. Review and clone the trusted Vanilla repo to `/opt/vanilla` at a
   **reviewed commit SHA**. Do not run the installer from an unverified fork.

After reviewing the scripts, run these commands on the **new VPS**:

```sh
sudo bash /opt/vanilla/services/pdfcraft-worker/install-linux.sh

# Does not change the host: tests actual namespaces and merges two valid PDFs
# through the pinned native binary with pypdf independent verification.
sudo bash /opt/vanilla/services/pdfcraft-worker/check-host.sh
```

If you see a user namespace or network namespace failure on Ubuntu 24.04,
do **not** run a global AppArmor-disabling sysctl. Inspect the system-provided
`bwrap-userns-restrict` profile first:

```sh
sudo apt-get install apparmor-profiles apparmor-utils
sudo less /usr/share/apparmor/extra-profiles/bwrap-userns-restrict
# Only after reviewing the vendor profile, explicitly opt in:
sudo bash /opt/vanilla/services/pdfcraft-worker/enable-scoped-apparmor.sh
sudo bash /opt/vanilla/services/pdfcraft-worker/check-host.sh
```

This is a narrowly scoped, reversible policy change. It is **not** executed
automatically by cloud-init or the base installer. If the profile does not
exist, another kernel/AppArmor restriction still prevents the sandbox, or a
preflight assertion fails, stop deployment and investigate instead of weakening
the global kernel policy or removing `--unshare-net`.

**Live activation gate:** ONLY after `check-host.sh` has printed both
`PASS: verified pinned binary, rootless sandbox and independent network namespace`
and `PASS: actual native PDF merge IN the sandbox` should you create the
separate worker's secret, enable the systemd service and configure TLS. Before
the worker is online and the signed `/ready` check succeeds, do not set the
Railway `WEIGUO_PDFCRAFT_REMOTE_ENABLED` flag. The existing PWA/Retina/CREAM
remains usable throughout.

**Caddy requirement:** `request_body { max_size ... }` requires **Caddy
2.10.0 or newer**. Use Caddy's official package or a reviewed equivalent and
validate with `sudo caddy validate --config /etc/caddy/Caddyfile`. Do not
replace another site's live Caddyfile without merging its existing entries.
Configure HTTPS routing only for `/v1/pdfcraft/ready` and
`/v1/pdfcraft/combine`.

### Operator acceptance record

| Gate | What to verify | Result before VPS provisioning |
| --- | --- | --- |
| OS/CPU | Ubuntu 24.04, Linux x86_64 | Not tested on user's VPS |
| Namespace/AppArmor | User, PID, mount, isolated network namespaces | Not tested on user's VPS |
| Executable integrity | Pinned v0.9.0 SHA-256 | Verified in CI only |
| Golden test | Two PDF inputs, two pages in correct order | CI passed; VPS test pending |
| TLS/DNS | Valid HTTPS certificate, expected domain | Not configured |
| Worker HMAC | Shared 256-bit key, signed readiness and merge | Offline tests passed; VPS pending |
| Gateway switch | Feature advertised only after signed readiness | Off by default |

## 1. Host requirements

Use a dedicated Ubuntu **24.04 x86_64** VM with at least 2 vCPU/2 GB RAM,
kernel allowing unprivileged user, network and mount namespaces, SSH admin
access and a domain that you control. This is **not Raspberry Pi** and not a
second instance of the public WeiGuo browser service.

Place the trusted Vanilla repo checkout at `/opt/vanilla`, preferably pinned
to a reviewed immutable commit, rather than blindly executing a moving
`main` branch. After reviewing the script, run:

```sh
sudo bash /opt/vanilla/services/pdfcraft-worker/install-linux.sh
```

The installer pins upstream `storytold/pdfcraft` **v0.9.0**:
- release archive SHA-256: `cdba2bec4d502d016dd78101a402d07845b708c49d77bc85e0ab640aca65372b`
- executable SHA-256: `073c9c4eb4193cbbf52211d5ad8102969b0731b3294e44c47ab289ac84d2640f`

It creates no secrets and **does not start the worker**. The upstream
MIT/Apache notices are copied to `/usr/local/share/doc/vanilla-pdfcraft`.

## 2. Prove OS isolation BEFORE enabling the worker

```sh
sudo -u vanilla-pdfcraft env \
  PYTHONPATH=/opt/vanilla/services/weiguo \
  WEIGUO_PDFCRAFT_SANDBOX=bubblewrap \
  /opt/vanilla/.venv-pdfcraft/bin/python -c \
  'from pdfcraft_native import probe_sandbox; assert probe_sandbox(), "Kernel sandbox unavailable"'
```

If the probe fails, stop. Check `kernel.unprivileged_userns_clone`,
`user.max_user_namespaces`, any AppArmor/SELinux restrictions and the
distribution's bubblewrap setup. **Never bypass this probe or run the CLI
unsandboxed to make the status turn green.** CPU/memory limits are also
specified in systemd, while the CLI subprocess has a strict timeout.

## 3. Host-only configuration (NEVER commit)

Generate one shared random key with `openssl rand -hex 32`, then create
`/etc/vanilla/pdfcraft-worker.env` with mode 0640, owner root and group
`vanilla-pdfcraft`:

```dotenv
WEIGUO_PDFCRAFT_WORKER_SECRET=YOUR_64_HEX_RANDOM_BYTES
WEIGUO_PDFCRAFT_ENABLED=true
WEIGUO_PDFCRAFT_EGRESS_ISOLATED=true
WEIGUO_PDFCRAFT_SANDBOX=bubblewrap
WEIGUO_PDFCRAFT_CLI=/usr/local/bin/pdfcraft-cli
WEIGUO_PDFCRAFT_SHA256=073c9c4eb4193cbbf52211d5ad8102969b0731b3294e44c47ab289ac84d2640f
```

The EGRESS_ISOLATED flag is an operator declaration; the actual sandbox probe
is separately enforced in code. Use the *same* HMAC key only in the Railway
backend's server-side variables, **never in the PWA or JavaScript bundle**.
No Google OAuth token, WeiGuo admin key or family account information belongs
on the worker.

```sh
sudo systemctl enable --now vanilla-pdfcraft-worker
sudo systemctl status vanilla-pdfcraft-worker
```

The worker listens only on `127.0.0.1:8090`, uses **one** uvicorn process
(required for the replay cache), has no public health endpoint and denies all
unsigned requests. Do not publish port 8090 or log PDF bodies.

## 4. HTTPS ingress

Install Caddy or your reviewed TLS proxy. Replace `pdfcraft.example.com` in
`Caddyfile.example`, configure DNS, point the proxy at `127.0.0.1:8090`
and restrict firewall exposure to HTTPS (443) plus SSH admin. Optionally add
edge IP ACL or a private VPN. TLS must validate successfully from Railway,
and outbound connection from Railway to the dedicated host must be permitted.

This example uses conventional HTTPS reverse proxying. Uploaded PDFs therefore
pass through the chosen TLS termination service. Account for that processing
in your deployment/privacy policy and obtain appropriate upload consent.

## 5. WeiGuo Railway backend (gateway only)

Once the worker is reachable and its sandbox probe passed, set these **server
environment variables** on the existing `weiguo-browser` service:

```dotenv
WEIGUO_PDFCRAFT_REMOTE_ENABLED=true
WEIGUO_PDFCRAFT_WORKER_URL=https://pdfcraft.example.com
WEIGUO_PDFCRAFT_WORKER_SECRET=SAME_64_HEX_SECRET
```

Keep the existing Railway-local
`WEIGUO_PDFCRAFT_ENABLED=false` and
`WEIGUO_PDFCRAFT_EGRESS_ISOLATED=false`. The gateway takes the remote route
first whenever explicitly requested and **never falls back to an unsafe local
CLI**. A failed signed `/ready` probe makes the UI return **unavailable**.

The family endpoint remains
`POST /v1/family/orchestra/pdfcraft/combine`; existing frontend works
without modification. Limit is 2–3 PDFs, at most 2 MiB each, 12 MiB output,
one native CLI at a time. Every worker call is signed over method, exact path,
body hash, 45-second timestamp window and nonce. Worker enforces replay
rejection and fail-closed request limits.

## 6. Operational checks and rollback

1. Start with **test PDFs**, not private medical/financial documents. Confirm
   correct 2+ page output, PDF order and multiple-viewer rendering.
2. Check `GET /v1/family/orchestra/capabilities` **after signing in**; remote
   status becomes configured only after a signed worker-ready response.
3. Verify expired/unsigned calls fail, malformed PDF rejects, and when the
   worker is stopped, the native button becomes unavailable upon refresh.
4. For immediate rollback, unset or set
   `WEIGUO_PDFCRAFT_REMOTE_ENABLED=false` on Railway; native operations
   become unavailable again while all existing Vanilla/CREAM/Retina functions
   remain intact. Stop the VM worker with
   `sudo systemctl stop vanilla-pdfcraft-worker`.

`python3 -m unittest discover -s services/weiguo -p 'test_pdfcraft_remote.py'`
runs the protocol's offline integration suite. GitHub CI cannot prove that
your new host's kernel allows Bubblewrap, that your TLS/DNS works, or that your
host networking actually blocks native process egress. Those checks are
required on the deployed Linux machine.

**Scope:** only PDF merge; no arbitrary Python, shell, URL fetch, MCP,
network browser control, OCR or unrestricted PDF editing. This worker is a
dedicated host/service, not an extra AI model. Upstream licensing and support
for hostile PDFs must be reviewed before general-public exposure.
