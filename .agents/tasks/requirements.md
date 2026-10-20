# Requirements: OAuth App Approval Guide Agent

## Summary

A deployable full-stack web app that tells developers exactly how to set up an OAuth app with a given provider and get it approved: where to start, ordered steps, how long it takes (hands-on effort vs approval wait), requirements and nuances, common blockers with fixes, and which parts an agent can do versus where a human must take over.

It has three parts:

1. A library of 14 curated guides stored as JSON in the repo, each citing real source URLs and per-section confidence.
2. A live-generation flow: the user submits an app name or URL, a backend agent researches it (Tavily search + extract), OpenAI drafts a structured guide, a self-check pass marks unsupported claims, and progress streams to the UI over SSE.
3. A polished dark, glassmorphic UI with a tasteful 3D hero (React Three Fiber) that degrades gracefully.

Deployment: React frontend on Vercel, Node/Express API on Render. The deliverable for the reviewer is a submission PDF (under 10 MB) with live links, architecture, sample guides, evidence log, and real screenshots. No Loom/video content anywhere.

Candidate: yadavchandan6103@gmail.com. Context: "APM Integrations Take-home, Product Intern".

## Assumptions

- A1. The user will supply OPENAI_API_KEY and TAVILY_API_KEY at deploy time. The app must boot, serve the curated library, and show a clear "live generation unavailable" message without them.
- A2. Live URLs are unknown at build time. The PDF reads them from one config file with placeholders the user fills in after deploying, then re-runs `npm run pdf`.
- A3. "~14 guides" means exactly these 14: GitHub, Google Workspace/Gmail, Slack, Notion, Stripe Connect, Shopify, Discord, Zoom, Salesforce Connected App, HubSpot, Microsoft Entra/Graph, Atlassian Jira (3LO), Linear, Figma.
- A4. Curated content is authored from documentation knowledge plus a link-check pass. A section may be labelled "verified" only when its claims are backed by an official source URL that passes the link checker; otherwise "community-reported" or "uncertain". Honesty over polish.
- A5. One Render instance (free tier), so the in-memory rate limiter and concurrency guard are per-process and that is acceptable.
- A6. Render's free filesystem is ephemeral. Default persistence is file-based (lost on redeploy). Durable shareable live links need Upstash Redis env vars; this is documented, not required.
- A7. `render.yaml` lives at the repo root (Render Blueprints read it from there) and targets the `backend/` directory. This deviates slightly from "backend render.yaml" for platform reasons.
- A8. The backend runs on Node ≥ 20.3 (Render `NODE_VERSION=22`). Local dev uses Node 22.

## Functional Requirements

### FR1. Guide schema
A single shared zod schema defines a guide: app name, slug, brand (color + monogram), category, difficulty (Easy/Moderate/Hard/Very Hard) + one-line reason, time estimate split into hands-on effort and approval wait (ranges), review (required boolean, review types, when required, review stages), OAuth availability, prerequisites, ordered setup steps (title, detail, console URL or null, actor: agent / human / assist), redirect URI notes, recommended scopes, sensitive/restricted scopes with consequences, common blockers with resolutions, agent-vs-human handoff, per-section confidence, verification (sources, checked/corrected/uncertain, last-verified date), generatedBy (`curated` | `live-agent`) and timestamp.

### FR2. Curated library
14 JSON guides in `shared/guides/`, all valid against the schema, spanning every difficulty level, with at least one each of: instant/no review (GitHub), optional listing review (Slack), mandatory app review (Shopify, Zoom), security assessment (Google restricted scopes + CASA), publisher verification/admin consent (Microsoft Entra). Every guide cites at least 2 real source URLs, at least one official.

### FR3. Live generation
`POST /api/generate` accepts `{ app, force? }`, streams SSE progress events (`meta`, `step`, `source`, `guide`, `error`, `done`), and finishes with a full schema-valid guide, or a clear error. Stages: resolve, search, read, draft, verify, save. If the app has no OAuth, the guide says so and lists alternatives. Total timeout is 120 s by default. The run aborts when the client disconnects.

### FR4. Grounding and URL integrity
Live guides may only cite URLs actually returned by Tavily in that run. Console URLs not matching a retrieved source domain are dropped (set to null). Curated guides cite only URLs that pass the link-check script.

### FR5. Persistence, cache, and sharing
A pluggable store (memory, file, Upstash Redis REST) persists live guides by slug. Each guide has a shareable URL `/guides/<slug>` that works on deep link and refresh. Recent generations are cached by normalized app key (default TTL 7 days). A request matching a curated app returns the curated guide unless `force: true`.

### FR6. Abuse and cost guards
- The generation endpoint is rate limited per IP (default 5/hour, configurable). Cache hits do not consume quota.
- A global concurrency cap applies (default 2).
- Input is validated: required, 2–80 chars for names, ≤200 chars for URLs, http/https only, no control characters.
- JSON body limit is 2 KB.

### FR7. Health and config
`GET /api/health` returns status, uptime, store kind, and whether the LLM and search are configured. The server boots without API keys. Generation then returns `503 CONFIG_MISSING`.

### FR8. CORS and secrets
CORS allows only `ALLOWED_ORIGINS` (comma-separated, exact match; defaults include `http://localhost:5173` and `http://localhost:4173`). No secrets in the repo. `.env.example` files list every variable without values.

### FR9. Frontend pages
- Landing: 3D hero, value prop, library search, generate-any-app input, featured guides.
- Library: grid with filters for difficulty, review required, and category, plus text search.
- Guide detail: difficulty badge, effort and wait meters, approval-wait timeline, step list with actor labels, scopes panel, blockers accordion, agent-vs-human panel, sources and verification panel, copy-share button, print-friendly styling.
- Live generation: streaming activity timeline, then the rendered guide, cancel, error and retry, and a cold-start notice.
- About/Methodology: evidence levels and how the agent works.
- 404 page.

### FR10. 3D and visual quality
Dark theme, glassmorphism, and a React Three Fiber hero that is lazy-loaded and decorative (`aria-hidden`). Static CSS/SVG fallback when WebGL is unavailable, `prefers-reduced-motion: reduce` is set, or the device is low-power. Cards get subtle 3D tilt, disabled under reduced motion.

### FR11. Deployment artifacts
- `frontend/vercel.json` with SPA rewrites.
- `frontend/.env.example` (`VITE_API_URL`).
- Root `render.yaml`: web service, build/start commands, `/api/health` check, env vars without values.
- `backend/.env.example`.
- Root `README.md` with local dev, deploy steps for both platforms, env var table, UptimeRobot tip, and the PDF build steps.

### FR12. Submission PDF
`npm run pdf` (from `submission/`, also exposed at repo root) builds `submission/Composio_OAuth_Guide_Agent_Submission.pdf` from source in `submission/`, reading links from `submission/links.config.json`. Contents:
- Title page (project name, "APM Integrations Take-home, Product Intern", yadavchandan6103@gmail.com, date)
- Problem understanding
- Scope decision and rationale
- How it works, with an inline SVG architecture diagram
- Guide format
- Sample excerpts for GitHub, Google Workspace, and Shopify, rendered from the real JSON
- Live agent flow
- Evidence/verification log (learned, corrected, unverified)
- Use of agents
- Limitations
- Future work
- Real screenshots of the running app

No Loom/video section. A companion `npm run screenshots` captures the screenshots.

## Non-Functional Requirements

- NFR1. Performance: landing JS (excluding the lazy 3D chunk) ≤ 250 KB gzip. The 3D chunk loads after first paint. Canvas DPR is capped at 1.75 and rendering pauses when the hero is off-screen.
- NFR2. Accessibility:
  - Semantic landmarks and keyboard-operable controls with visible focus.
  - Accordion buttons use `aria-expanded`/`aria-controls`.
  - The live activity timeline is an `aria-live="polite"` region.
  - Text contrast on glass surfaces ≥ 4.5:1.
  - Meters expose text equivalents.
  - Full WCAG validation needs manual assistive-technology testing, which is out of scope here.
- NFR3. Security:
  - Helmet headers on the API.
  - No user-supplied URL is fetched by our server directly (Tavily fetches).
  - Retrieved page content is treated as untrusted data in prompts.
  - LLM output is schema-validated and HTML-escaped by React.
  - No `dangerouslySetInnerHTML` for guide content.
- NFR4. Reliability: every failure path renders a visible message. No blank screens. A React error boundary wraps routes.
- NFR5. Pinned versions: all dependencies use exact versions (no `^`/`~`), with lockfiles committed.
- NFR6. Portability: all scripts run on Windows PowerShell and on Linux (Render/Vercel). No bash-only syntax in npm scripts.

## Acceptance Criteria

### Schema and content
1. `npm test` in `backend/` validates all 14 curated guides against `GuideSchema`: unique slugs, ≥2 sources each with ≥1 `official`, every URL `https://`, valid `lastVerified` date, and steps with an `actor` in {agent, human, assist}.
2. The curated set contains ≥1 guide of each difficulty level, and the GitHub, Google Workspace, and Shopify guides have difficulties Easy, Very Hard, and Hard respectively.
3. `node scripts/check-links.mjs` reports every curated source URL. Any URL failing (non-2xx/3xx after redirects, excluding documented 403 bot-blocks) is removed or replaced before submission. Any section citing only failed URLs is downgraded below `verified`.

### Backend
4. `GET /api/health` returns 200 JSON with `status: "ok"`, `store`, `llmConfigured`, and `searchConfigured`, with no API keys set.
5. `GET /api/guides/github` returns the curated guide. `GET /api/guides/does-not-exist` returns 404 `{ error: { code: "NOT_FOUND" } }`. `GET /api/guides/BAD_SLUG!` returns 400.
6. `POST /api/generate` with `{ "app": "" }`, a 300-char string, `javascript:alert(1)`, or a value containing a control character (e.g. `"a\nb"`) returns 400 `INVALID_INPUT` before any stream starts. `"  Asana  "` is accepted.
7. With keys unset, `POST /api/generate {"app":"Asana"}` returns 503 `CONFIG_MISSING` JSON.
8. With a mocked pipeline, a generate request responds `Content-Type: text/event-stream`. Events arrive in order: `meta` → ≥1 `step` → `guide` → `done`. The `guide` payload passes `GuideSchema`.
9. A 6th uncached generation from one IP within an hour (default config) returns 429 `RATE_LIMITED` with a `Retry-After` header. A cached or curated hit does not count toward the limit.
10. A request with `Origin: https://evil.example` receives no `Access-Control-Allow-Origin` header. An origin listed in `ALLOWED_ORIGINS` receives its exact origin echoed back.
11. Pipeline unit tests (mocked deps) show:
    - The verifier failing still yields a guide, with all sections capped at `community` or below and a note in `verification.uncertain`.
    - Zero search results yields an `error` event `NO_SOURCES`.
    - Exceeding the timeout yields `error` `TIMEOUT`.
    - Aborting the signal stops further LLM/search calls.
12. Post-processing tests show that a draft citing source index 99 (not retrieved) is dropped, and a `consoleUrl` on an unretrieved domain becomes `null`.
13. Live-generated guides are retrievable at `GET /api/guides/<slug>` after generation (memory/file store), and a second request for the same normalized app (e.g. "Asana" vs "asana.com" vs " ASANA ") returns `guide` with `cached: true` without calling the pipeline.

### Frontend
14. `npm run build` in `frontend/` succeeds with zero TypeScript errors.
15. Visiting `/guides/github` directly (hard refresh) on the Vercel deployment and on `vite preview` renders the guide (SPA rewrite works).
16. Library filters narrow the grid correctly: Difficulty=Easy, Review required=Yes, and Category, combined with text search. Text search also matches aliases ("gmail" shows Google Workspace). "No guides match" shows when the result is empty. Covered by a component test.
17. Guide detail shows all sections from FR9. Each of the nine confidence-bearing sections (difficulty, time estimate, review timeline, prerequisites, steps, scopes, redirect URIs, blockers, agent handoff) shows a confidence tag. The summary and sources panel show none; sources shows the last-verified date instead. The copy-share button copies the absolute URL and announces "Link copied" via `aria-live`.
18. With `prefers-reduced-motion: reduce` emulated, or WebGL unavailable (test stubs `getContext` → null), no `<canvas>` renders and the static hero fallback appears. Covered by a component test.
19. On the live page, a mocked stream renders each `step` in the activity timeline as it arrives, then renders the guide. An `error` event renders an error panel with a "Try again" button and a library link. A cancel button aborts the request.
20. If the response headers haven't arrived within 4 s (on the live page or a live-guide permalink), a notice appears: "Waking up the agent server…". It disappears once they arrive.
20a. When `/api/health` reports the LLM or search isn't configured, the live page shows "Live research isn't configured on this server. Curated guides still load." The input stays usable.
20b. A permalink request that returns 400 or 404 shows "Guide not found" with no Retry button.
21. When the API is unreachable, the library and curated guides still work, since they're bundled, and the generate page shows a clear error.
22. Print preview of a guide page hides nav and 3D, uses a light background, and shows all blocker content expanded.

### Deployment and PDF
23. `render.yaml` declares a web service with build `cd backend && npm ci --include=dev && npm run build`, start `cd backend && npm start`, `healthCheckPath: /api/health`, and every env var name from `backend/.env.example` (secrets as `sync: false`).
24. `npm run pdf` on Windows produces `submission/Composio_OAuth_Guide_Agent_Submission.pdf` < 10 MB. It contains all FR12 sections, an inline SVG diagram, the three sample excerpts, and ≥4 screenshots. It mentions no Loom/video. It warns in the console if `links.config.json` still holds placeholders.
25. No file in the repo contains a real API key. `git grep -E "sk-[A-Za-z0-9]{20}|tvly-[A-Za-z0-9]{10}"` returns nothing.

## Out of Scope

- Loom or any video recording.
- User accounts, authentication, or saved-guide editing (live generation is anonymous, protected by rate limit and concurrency cap).
- Actually creating OAuth apps on providers' consoles on the user's behalf.
- Multi-instance rate limiting (Redis-backed limiter), and Vercel preview-domain wildcard CORS.
- Guide editing UI, admin moderation of generated guides, analytics.
- i18n. English only.
- Formal WCAG audit.
