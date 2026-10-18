# Vanilla AI architecture

Vanilla is an independent, local-first family AI workspace. LINE Intelligence is an optional import connector, **not** the product's primary interface.

## Core modules
- Chat and model routing
- Multi-agent workforce and task approvals
- Family identity: 哲愷 / 哲緯 / 曉芬, with per-user data isolation
- Private memory and RAG
- Travel planning and tour guide
- Health research assistant
- Optional LINE text export import

## Deployment
GitHub Pages hosts only static React assets. Do not put secrets, family records, LINE transcripts or health data in this repository or in public static assets. Authenticated FastAPI, PostgreSQL, document storage, Ollama and task workers belong on a private server.

## Current status
UI prototype only. No model inference, LINE parsing, authenticated backend, encrypted sync, or autonomous agent execution is implemented yet.

## Next milestones
1. Add a tested authentication backend and scoped household permissions.
2. Add secure model gateway and local inference.
3. Add persistent tasks, memory and RAG.
4. Add optional LINE text import with consent and review.
5. Add native/offline inference where supported.
