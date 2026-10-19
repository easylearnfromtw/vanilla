# Detroit API Registry — shipped discovery MVP

This feature adds an explicit, read-only API catalogue to Detroit Studio. It DOES NOT install or execute third-party APIs, use secrets, connect Apify accounts, enable cloud billing, or act as a general MCP server.

## Implemented
1. User selects one of four curated API-mega-list categories and explicitly requests a public GitHub README from a fixed URL.
2. The parser recognizes only Apify listing links, strips tracking query parameters, removes duplicates, filters common prompt-injection patterns and enforces size and count limits (600,000 chars, 250 entries).
3. Zeus ranks candidate titles and descriptions locally and recommends the appropriate future engine: Scouts, CREAM or Zeus.
4. Athena presents a pre-connection risk checklist. Every entry is marked unverified, cost unknown, authorization unknown and execution disabled.
5. Private mode or offline mode blocks network import. No user chat data or secret is transmitted by registry browsing.
6. A separate link references public-apis/public-apis; indexing this alternative source is not yet implemented.

## Do not mistake metadata for connectivity
A third-party list does not prove that a service exists, is safe, free, licensed for reuse or appropriate for Taiwan. A future executable connector must live in an authenticated backend, use allowlisted egress and SSRF protection, scope access per user, keep keys server-side, enforce quotas and billing ceilings, require explicit owner approval, and produce real test and audit evidence. None of that is automatically authorized here.

## Test
npm run test:api-registry
npm run test:detroit
npm run build

Open Detroit Studio → API Registry; press Load Public Directory while online and outside private mode; search, inspect Athena checklist, and follow a sanitized source link. Existing tools remain unchanged.

## Roadmap, not shipped
Vetted connector manifests, health checks, protected backend execution, cost verification and automatic dispatch. Non-Apify source synchronization requires separate parser and provenance review.
