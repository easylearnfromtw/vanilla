# Medusa — Detroit Factory / Judge0 execution adapter

## Scope and status

Medusa is Vanilla's name for the **optional Judge0 sandbox execution adapter**.
It is **not** a second language model, not a replacement for JENSEN HUANG or CREAM,
and does **not** make iPhone Safari capable of hosting a Docker sandbox.

This repository provides:
- A separately deployed Judge0 HTTP adapter in `services/weiguo/medusa_engine.py`
- Family Google OIDC authentication via the existing WeiGuo gateway
- `POST /v1/family/medusa/execute` with mandatory `approved: true`
- A Detroit Factory / Detroit Studio manual execution panel
- Input bounds, per-account rate limiting, constrained resources, output bounds,
  narrowly allowed languages and disabled-by-default behavior

**An actual Judge0 deployment is not included and no execution is available
until the operator separately installs and securely configures Judge0.**

## Routing

User (Vanilla PWA) → explicit per-run consent → WeiGuo family session
→ Medusa server adapter → private Judge0 API → limited stdout/stderr/result
→ Medusa UI. The frontend never receives the operator/admin token.

Supported initial language selectors: `python` (Judge0 language ID 71),
`javascript` (63), and `cpp` (54). These IDs are common Judge0 CE examples,
not immutable guarantees: verify the `GET /languages` list for the exact
version deployed before enabling the service.

JENSEN HUANG can subsequently propose source code; Zeus may suggest the
Medusa tool for a code task, but **neither can execute it automatically** through
this initial integration. CREAM's core remains local/deterministic and separate.

## Operator deployment checklist

1. Deploy **a reviewed and patched version** of
   [Judge0 CE](https://github.com/judge0/judge0) on a trusted private Docker host,
   following its upstream license and security requirements.
2. Keep Judge0's API, workers, PostgreSQL, and Redis off the public Internet.
   **Do not** publish Judge0 ports, mount host Docker sockets, mount user home
   directories, or expose secrets to execution containers.
3. Enforce **actual egress isolation**, including DNS and private/metadata
   address blocks, with a host firewall or equivalent network policy.
   Set Judge0's own network defaults and overrides to deny network usage.
   A JSON value `enable_network: false` alone is not a security boundary.
4. Place the WeiGuo backend and the private Judge0 API on a trusted internal
   service network so that WeiGuo can reach the service by one of the reviewed
   DNS aliases `medusa` or `judge0` at HTTP port 2358. The sandbox worker
   containers must not share WeiGuo's filesystem or have broad network egress.
5. Verify `POST /submissions?base64_encoded=false&wait=true` works on the
   specific Judge0 version. The adapter deliberately fails if synchronous
   responses are not available, rather than pretending submission succeeded.
6. Only after a security review, set **server-only** values:
   ```dotenv
   WEIGUO_MEDUSA_ENABLED=true
   WEIGUO_MEDUSA_ISOLATED=true
   WEIGUO_MEDUSA_URL=http://medusa:2358
   ```
   The flags are operator attestations; they do not configure a firewall.
   URLs from a chat message, browser, or custom tool manifest are ignored.
7. Keep the existing WeiGuo OIDC family ACL, HTTPS ingress, session expiry,
   backend API limits, and private-mode restrictions.

## Supported API

Request:

```json
{"language":"python","source_code":"print(40 + 2)","stdin":"","approved":true}
```

Response (representative fields; execution requires deployed Judge0):

```json
{
  "engine":"medusa-judge0",
  "language":"python",
  "success":true,
  "status":{"id":3,"description":"Accepted"},
  "stdout":"42\n",
  "stderr":"",
  "compile_output":"",
  "message":"",
  "time":"0.01",
  "memory":"3100",
  "network":"disabled-by-request"
}
```

Only the frontend can request this route after the user presses the submit
button and acknowledges consent. The backend independently checks signed-in
role, input bounds and the consent field. Rate limit: up to 3 submissions per
family user per minute, per process. This first phase deliberately does not
store source code, support filesystem mounts, install packages, allow network,
run background jobs, or automatically commit code to GitHub.

## Tests

The `test_medusa_engine.py` suite mocks Judge0 (no untrusted code executes).
`test_family_api.py` verifies authentication, viewer refusal and per-run
consent through the existing ASGI HTTP gateway. The standard PR CI invokes
these tests. A real isolated deployment requires separate staging verification.

## License and security review

Judge0 CE is distributed under GPL-3.0; review obligations when distributing
modified code or bundled components. This adapter uses Judge0 as an external
service rather than copying Judge0 source into Vanilla. Open-source licensing
and sandbox isolation must be reviewed independently before production use.
