# OAuth Approval Guide Agent

A full-stack app that answers, for a given third-party app, **how hard its OAuth approval is, what you have to do, what an agent can do for you, how long approval takes, and where the landmines are** — with every claim traceable to an official source.

It ships two things in one schema:

- A **curated library** of 14 verified guides, bundled into the frontend so it works instantly (even while the backend is cold).
- A **live agent** that generates the same structured guide for any app on demand, streaming its progress over Server-Sent Events.

## Architecture

```
Browser SPA (Vercel)  ──HTTPS──▶  Express Agent API (Render)  ──▶  Tavily (search/extract)
  React + Vite        ◀──SSE────   /api/health /api/guides          OpenAI (draft/verify)
  14 curated guides                /api/generate (streamed)         Store (Upstash / file)
```

- **frontend/** — React 18 + Vite SPA → **Vercel**. Bundles the curated guides; calls the backend only for live generation and permalinks.
- **backend/** — Node 22 + Express 4 agent API → **Render**. A long-lived server, so a 90-second live run streams without a serverless timeout.
- **shared/** — the single source of truth: the zod `GuideSchema` and the 14 guide JSON files. `scripts/sync-shared.mjs` copies it into each app before every dev/build/test.
- **submission/** — scripts that build the submission PDF and capture screenshots.

## Local development

Two packages, two terminals. The `pre*` scripts run `sync-shared.mjs` automatically.

Terminal 1 — backend (http://localhost:8787):

```
npm --prefix backend install
npm --prefix backend run dev
```

Terminal 2 — frontend (http://localhost:5173):

```
npm --prefix frontend install
npm --prefix frontend run dev
```

Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env` to override defaults. The curated library works with no keys; live generation needs `OPENAI_API_KEY` and `TAVILY_API_KEY`.

> Note: if `npm --prefix <dir> install` errors on your npm version, run `npm install` from inside the package directory instead.

## Environment variables

Backend (`backend/.env.example` lists all of these; secrets are blank):

| var | default | purpose |
|---|---|---|
| `PORT` | `8787` | HTTP port (Render injects `10000`) |
| `NODE_ENV` | `development` | `development` / `production` / `test` |
| `ALLOWED_ORIGINS` | localhost | CSV of allowed CORS origins; set to the Vercel URL in prod |
| `OPENAI_API_KEY` | — | live generation (blank → `503 CONFIG_MISSING`) |
| `OPENAI_MODEL` | `gpt-4o-mini` | model for draft/verify |
| `TAVILY_API_KEY` | — | doc search (blank → `503 CONFIG_MISSING`) |
| `UPSTASH_REDIS_REST_URL` | — | durable links (both or neither) |
| `UPSTASH_REDIS_REST_TOKEN` | — | durable links |
| `STORE` | `auto` | `auto` / `memory` / `file` / `upstash` |
| `DATA_DIR` | `./.data` | file-store dir (ephemeral on Render) |
| `RATE_LIMIT_MAX` | `5` | live generations per window |
| `RATE_LIMIT_WINDOW_MS` | `3600000` | rate-limit window |
| `MAX_CONCURRENT_GENERATIONS` | `2` | simultaneous runs before `503 BUSY` |
| `GENERATION_TIMEOUT_MS` | `120000` | per-request timeout |
| `CACHE_TTL_HOURS` | `168` | live-guide cache TTL |
| `TRUST_PROXY` | `1` | trusted proxy hops |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |

Frontend: `VITE_API_URL` (the backend URL; `http://localhost:8787` locally, the Render URL in prod).

## Testing

```
npm --prefix backend test
npm --prefix frontend test
node scripts/check-links.mjs
```

`check-links` needs network access; it re-verifies every cited URL and writes `shared/link-check-report.json`.

## Deploy to Render (backend)

1. Create a **Blueprint** from the committed `render.yaml` (it defines the web service, build/start commands, and `healthCheckPath: /api/health`).
2. Set the `sync: false` secrets in the Render dashboard: `ALLOWED_ORIGINS`, `OPENAI_API_KEY`, `TAVILY_API_KEY`, and (optionally) `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`.
3. Set `ALLOWED_ORIGINS` to your Vercel URL (blank means localhost only, and the boot log warns).
4. One-time: confirm `TRUST_PROXY=1` is correct for Render's single-proxy setup (it is the default here).

## Deploy to Vercel (frontend)

- **Root Directory:** `frontend`
- **Framework preset:** Vite · build `npm run build` · output `dist`
- **Env:** `VITE_API_URL=https://<your-render-service>.onrender.com`
- **"Include source files outside of the Root Directory":** ON — the `prebuild` sync needs to read `../shared`.

`frontend/vercel.json` rewrites all non-file paths to `/index.html` (SPA deep links), caches `/assets/*` immutably, and sets `nosniff` + referrer headers.

## Keeping Render warm

Render's free tier sleeps after inactivity, so the first request can take 30–60 seconds. Point a free **UptimeRobot** monitor at `https://<your-render-service>.onrender.com/api/health` every ~10 minutes, and wake the service manually right before a demo. A paid tier removes cold starts entirely.

## Durable, shareable links (Upstash)

Without Upstash, live-generated guides are stored on the file store and wiped on redeploy. Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (free Upstash Redis) and leave `STORE=auto` to persist live guides so their permalinks survive redeploys.

## Adding a curated guide

1. Add `shared/guides/<slug>.json` (filename stem must equal `slug`), following the shape of the existing guides.
2. `npm run check:links` (runs `node scripts/check-links.mjs`) to verify every cited URL.
3. `npm --prefix backend test` to validate it against `GuideSchema`.

## Building the submission PDF

```
npm --prefix submission install
npm --prefix frontend run build
npm --prefix frontend run preview      # in a second terminal, serves :4173
npm --prefix submission run screenshots
npm --prefix submission run pdf
```

- `run screenshots` captures the app into `submission/screenshots/` (needs the preview running).
- `run pdf` builds `submission/Composio_OAuth_Guide_Agent_Submission.pdf`, reading live links from `submission/links.config.json`. Fill in your real Vercel/Render/repo URLs there first; use `npm --prefix submission run pdf:draft` to build while the URLs are still placeholders.
