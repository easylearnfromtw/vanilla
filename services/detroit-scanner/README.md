# Athena private ClamAV scanner (deployment required)

This is a **private, optional scanning gateway**, not a service currently hosted by Vanilla. It accepts raw binary bytes and calls ClamAV `INSTREAM` over a private Docker network. Files are never executed and are not written to disk. It implements a fail-closed 15 MB limit. AV detection depends on updated ClamAV signatures and is not a guarantee against all malware or prompt injection.

1. On your own Linux host with Docker Compose installed, create a **private `.env`** with `ATHENA_SCAN_TOKEN=` followed by at least 32 cryptographically random characters. Do not commit it.
2. Copy `docker-compose.example.yml` to `docker-compose.yml`; run `docker compose up -d --build`; wait for ClamAV database signatures to finish loading.
3. Local-only smoke test: `curl -f -H "Authorization: Bearer $ATHENA_SCAN_TOKEN" -H 'Content-Type: application/octet-stream' --data-binary @safe.pdf http://127.0.0.1:8788/v1/scan`.
4. Integration requires a **trusted, authenticated server proxy** (ideally VPN or identity-aware gateway) to forward already consented uploads. Do not expose port 8788 directly to the public Internet, never embed the bearer token in GitHub Pages, and never treat the PWA's browser-only scan as a full AV verdict.
5. Test with EICAR (a nonmalicious antivirus test string) and a known clean file before accepting any uploads. Review false positives and quarantine policy manually.

The Cloudflare Persistent Jobs Worker is an independent scheduled service; it does not provide user login or forward attachments to ClamAV without an additional authenticated upload backend. This deliberate separation avoids unsafe browser-side admin credentials.