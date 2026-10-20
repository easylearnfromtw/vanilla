# Vanilla / Detroit Windows Node — installer and secure pairing

The Windows agent is a **paired Ollama inference node**, not a remote desktop, browser crawler, Python runner, or general command executor.

## User journey

1. Open the Vanilla website → 運算節點. The EXE download link is shown only when a verified GitHub release contains the exact installer asset.
2. Run the installer on Windows 10/11 x64; optionally enable launch at login. The program listens **only on 127.0.0.1:18765** and displays a random pairing key.
3. Install Ollama locally and download a model separately. The node has no model if Ollama is not installed.
4. Open Vanilla on the same Windows machine; paste the key. Pairing probes real models and hardware and makes this Ollama node available to the model router.
5. For iPhone clients, configure an approved **Tailscale Serve** private HTTPS URL for port 18765 (not Funnel/public port forwarding). Restrict tailnet ACL/grants and pair that URL in the website.

## Safety and limitations

- Browser-side discovery is limited to **known paired nodes**; websites cannot safely auto-scan arbitrary LAN hosts. Node URL must be loopback or HTTPS *.ts.net.
- Pairing tokens are stored in browser sessionStorage, not Drive, and must be entered again in another browser session. The Windows token is stored under the user's LOCALAPPDATA; protect the Windows user account.
- Windows closes the node server when the GUI closes. Autostart is opt-in. Sleep/hibernation suspends availability; background 24/7 coordination is not implied.
- The Windows API only supports /v1/status, /v1/health, /api/tags, /api/chat. No arbitrary OS commands, shell or file access. Remote tool execution is a separate future security-gated feature.
- This agent has not been verified on the user's own Windows machine. Run installer CI and test Tailscale HTTPS/CORS from real devices before promising production availability.
- Current build has no publisher code-signing certificate. Verify SHA256 and assess Windows SmartScreen before distributing broadly.
- 30B still requires RAM and CPU/GPU bandwidth; the RTX 3050 6 GB laptop cannot make 30B fast solely by joining a cluster.

## Test

node --experimental-strip-types --test tests/windows-nodes.test.mjs
python -m unittest discover -s services/windows-node -p 'test_*.py'
npm run build

Windows runner: trigger workflow_dispatch or push a release tag windows-node-v* **after merging**.
