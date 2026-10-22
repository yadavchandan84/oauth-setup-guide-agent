# How it works

The system is three deployable packages plus a shared schema.

{{ARCHITECTURE_SVG}}

## Frontend (Vercel)

A React + Vite single-page app. It **bundles all 14 curated guides at build time**, so browsing the library, reading a guide, and deep-linking (e.g. `/guides/github`) needs no backend. It talks to the backend only for live generation and for permalinks to live-generated guides.

## Backend (Render)

A Node + Express API with three surfaces:

- `GET /api/health` — a dependency-free liveness check (also what UptimeRobot pings).
- `GET /api/guides` and `GET /api/guides/:slug` — curated and recently-generated guides.
- `POST /api/generate` — the live agent, streamed as Server-Sent Events.

Because it is a normal long-lived server (not a serverless function), a 90-second agent run streams without hitting a platform timeout.

## The live agent pipeline

A single `POST /api/generate` request drives seven stages, each emitting a `step` event so the UI can show progress:

1. **resolve** — normalize the input (app name or docs URL) to a stable key; a curated or cached hit short-circuits here.
2. **search** — three parallel Tavily queries over official docs.
3. **read** — Tavily extract on the top pages.
4. **draft** — OpenAI structured output produces a guide draft against a strict schema.
5. **verify** — a second OpenAI pass checks the draft against the retrieved sources and lowers confidence where support is thin.
6. **assemble** — deterministic post-processing: normalize, allow-list console URLs, cap confidence, validate against the schema.
7. **save** — persist for a shareable permalink.

## Shared schema and sync

`shared/schema.ts` (a zod schema) and the 14 guide JSON files are the single source of truth. A dependency-free script, `scripts/sync-shared.mjs`, copies them into each app before every build, dev, and test run, so the frontend and backend compile against exactly the same types and data without cross-package module resolution.

## Safety posture

The server never fetches a user-supplied URL directly (Tavily does the fetching). Retrieved page content is treated as untrusted input in prompts. LLM output is schema-validated and React-escaped, never injected as raw HTML. Keys live only in platform environment variables.
