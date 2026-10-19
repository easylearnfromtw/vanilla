# Medusa — Detroit Factory code-execution tool

**Status: adapter integrated; OFF by default.** This does not install or run Judge0. The browser/PWA does not execute uploaded or generated code. Source: https://github.com/judge0/judge0.

## Responsibilities

- **Zeus** selects a suitable tool; **Athena** authorizes actions and validates untrusted content.
- **Medusa** submits narrowly bounded Python code to a separately deployed **Judge0** API.
- **JENSEN HUANG** may use its actual results for test feedback; **CREAM** can verify deterministic calculations once a trusted backend dispatcher is implemented.
- Medusa is an **execution tool**, not an additional language model and not a substitute for a secure container runtime.
- The Factory metadata in `src/detroit/factory.ts` and the WeiGuo catalog are **discoverability only**. They do not grant executable permissions or enable automatic dispatch.

## Server requirements — MUST complete before enablement

1. Deploy a trusted, reviewed and version-pinned Judge0 instance on a separate internal-only container/network. Neither the Judge0 API nor its workers may be exposed to the public Internet. Do not put credentials, Google tokens, application volumes, sockets, writable host mounts, or Docker/container control sockets inside the execution environment.
2. Enforce and test a **real outbound network firewall** for the Judge0 runner and submitted code, blocking Internet access, RFC1918, loopback, link-local, metadata IPs and DNS bypass/rebinding. **`MEDUSA_SANDBOX_EGRESS_BLOCKED=true` is only an operator attestation**; it does not implement these controls. Judge0 sandbox controls require host hardening as well. Use a separate deployment from the browser service when isolation cannot be assured.
3. Limit CPU, wall time, memory, concurrent submissions, files, processes and disk at the container/orchestrator level. The adapter additionally requests CPU 2 s, wall time 5 s, memory 128000 KB and max file size 1024 KB, but the server's hard limits must be independently configured/tested.
4. Call `GET /languages` on the *actual pinned Judge0 instance* from its trusted internal network and identify its supported Python language ID. Judge0 language IDs can vary by release/build. Do not assume the example value is correct.
5. Set **server-only** environment variables:
   ```dotenv
   MEDUSA_ENABLED=true
   MEDUSA_SANDBOX_EGRESS_BLOCKED=true
   MEDUSA_JUDGE0_URL=http://judge0:2358
   MEDUSA_PYTHON_LANGUAGE_ID=<verified-Python-ID>
   ```
   Only the fixed internal origin `http://judge0:2358` (or local `http://127.0.0.1:2358`) is accepted. No user-supplied URL, program-selected language or arbitrary command.
6. Restrict operator API network ingress to trusted hosts, keep `WEIGUO_ADMIN_TOKEN` secret and at least 32 characters, and do not allow a public PWA to access operator routes. On a public family instance, set `WEIGUO_PUBLIC_FAMILY_ONLY=true`: `/v1/operator/*` is hidden with 404.

## API contract (private operators only)

`POST /v1/operator/medusa/run`

Requires `Authorization: Bearer <server-only-operator-token>`.

Body:
```json
{"source_code":"print(1 + 1)","stdin":""}
```

Limits: source up to 16 KB, stdin up to 2 KB, only operator-configured Python; serialized execution via one semaphore per service process. Judge0 responses are clipped to 4 KiB per text field and limited to 64 KiB total response body. Pending results are polled within a bounded time; no execution claim is returned for unfinished jobs.

An accepted Judge0 completion yields fields such as:
```json
{"engine":"medusa","backend":"judge0","language":"python","finished":true,"accepted":true,"status_id":3,"status":"Accepted","stdout":"2\n","stderr":"","compile_output":"","exit_code":0,"time":"0.01","memory":1234}
```

`accepted=false` indicates the completed submission returned a non-accepted Judge0 status; it is not a successful test. Results must be checked by the caller. Failed requests never expose upstream raw errors or server tokens.

## What is not implemented

- No frontend "execute arbitrary code" button or family execution endpoint.
- No Judge0 Docker stack/vendor code bundled into Vanilla; deployment is a separate operator task.
- No automatic Zeus/JENSEN HUANG/CREAM execution loop or project filesystem writes. A future dispatcher must authenticate the requesting person, require an explicit approval for execution, prevent secrets in submitted source/stdin and enforce per-person quotas.
- No assertion that code execution is safe merely because Judge0 calls itself a sandbox. Perform real end-to-end tests on the target host before enabling.

## Tests

```bash
python3 -m pip install -r services/weiguo/requirements.txt
python3 -m unittest discover -s services/weiguo -p 'test_*.py'
npm run test:detroit-factory
```

Check the Judge0 project license and applicable obligations before commercial distribution or modified redistribution.
