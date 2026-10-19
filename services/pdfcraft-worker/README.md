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
