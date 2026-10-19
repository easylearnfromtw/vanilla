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


## Detroit Studio 手動執行（家庭管理者，需管理端另行核准）

Vanilla 現在提供 `Detroit Studio → Medusa` 操作介面，經現有 Google OIDC
家庭身分登入後，可透過後端呼叫獨立 Judge0 執行 Python、取得真實
stdout/stderr/status。**這個功能不會自動執行 AI 生成的任何程式。**

- `GET /v1/family/medusa/status`：檢查授權與 Judge0 API/language 是否可連線；
  連線成功 **不代表** 已完成隔離與實際執行驗收。
- `POST /v1/family/medusa/run`：以 `{ "source_code":"print(42)", "stdin":"", "approved":true }`
  執行一次；必須由使用者在 Medusa UI 逐次核准。
- 使用既有 Google 簽章家庭 Session；**僅 role=owner 且 Google sub 在伺服器白名單**可以呼叫。
  viewer、member 與未登入者均不得執行。
- 仍有每個 owner 每分鐘 3 次的應用程式層配額（每個服務程序）；
  多節點部署需補上共享限速與外部閘道配額。
- 私人模式阻擋前端發送；伺服器端不儲存 source/stdin 於工作佇列。
  它們會穿過 HTTPS 與內部 Judge0 API，所以不要提交密碼、個資或金鑰。

即使部署的衞國後端已經有這些路由，`MEDUSA_FAMILY_ENABLED` 預設仍是 false，
並且 **Judge0 本身不包含在本專案中**。

只有當實體 Judge0 執行節點通過端到端測試之後，才在伺服器 **私密環境變數**
追加以下欄位（不可寫在 GitHub Pages 或 Vite 變數）：

```dotenv
MEDUSA_ENABLED=true
MEDUSA_SANDBOX_EGRESS_BLOCKED=true
MEDUSA_JUDGE0_URL=http://judge0:2358
MEDUSA_PYTHON_LANGUAGE_ID=<GET /languages verified numeric id>
MEDUSA_FAMILY_ENABLED=true
MEDUSA_FAMILY_OWNER_SUBS=<verified Google OIDC sub>
```

前四項與既有管理員專用路由共用，後兩項只授予單一已核准的家庭 owner。
**不要用 email、暱稱或帳號下拉選擇器取代 Google sub。**

### Railway 的實際部署限制

Judge0 官方 Docker Compose 的 server 與 worker 都設有 `privileged: true`，
而目前 Vanilla 的 Railway `weiguo-browser` 是受限容器：
**不得直接在該容器裝 Judge0 或宣稱可以安全執行不可信程式。**
需要能使用 Judge0 的 isolate/cgroup 的獨立受控 Linux VPS / VM；
應將 Judge0 API 限制在私有網路，透過經驗證的私人通道讓 WeiGuo
只連到固定 `http://judge0:2358` 內部位址，禁止公開 API port 與 host Docker socket。

本版只完成 Vanilla 前後端接線與測試；完成後的分階段驗收需包括：
1. 執行 `print(42)` 得到 `42`，以及 Python 例外能回傳 stderr；
2. 迴圈 CPU 超時、記憶體超額、fork/process 限額確實由 **主機** 阻擋；
3. 沙盒內網路、內部 IP、metadata endpoint、DNS、宿主機檔案等不可存取；
4. 還原隔離環境和獨立使用者權限；確認不會暴露家庭服務、API 金鑰或其他容器；
5. 通過上述項目並驗證目標 Judge0 版本後，才可開啟 family flags。

尚未通過這些測試前，UI 必須顯示「尚未由管理端開啟」，不能出現成功執行的假結果。
