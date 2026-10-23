# Completeness audit (read-only), 2026-10-23

## Summary answer

The code is complete. All 25 ACs have an implementation, and every build and test passes on the current tree (backend: tsc OK, 115/115 tests; frontend: tsc + vite build OK, 38/38 tests). Nothing in the code would break a deploy. The project is not yet submittable for three reasons, and the user has to handle all of them:

1. Nothing is deployed, and no API keys are set anywhere. The keyed live-agent path (Tavily + OpenAI) has never run against the real APIs. Every pipeline and LLM test uses stubs. The assignment's main demo ("reviewers submit an unfamiliar app and watch the agent generate a guide live") is unproven.
2. `submission/links.config.json` still holds `YOUR-...` placeholders, and the committed PDF was built with `--draft`. The only screenshot of the Generate page shows the input disabled ("Live generation isn't configured for this deployment") because the preview build had no `VITE_API_URL`.
3. On Render's free tier, live-guide permalinks die on every restart or spin-down, not just on redeploy, unless Upstash is configured. The "shareable guide" requirement depends on this.

The README covers setup and deploy well, but it has no Key decisions, Limitations, or "what was tested" sections. The assignment asks for these explicitly.

---

## 1. Acceptance-criteria coverage

| AC | Status | Evidence |
|---|---|---|
| 1, 2 | Done | `backend/test/curated.test.ts`. 14 guides: GitHub=Easy, Google=Very Hard, Shopify=Hard, all 4 levels present |
| 3 | Done | `shared/link-check-report.json` (checkedAt 2026-10-22): 46 ok, 4 redirected, 0 broken. The 4 redirects are a login wall (github settings) and geo redirects (slack.com, stripe.com, salesforce.com). They are kept on purpose and explained in `submission/content/08-evidence-log.md` |
| 4, 7 | Done | `routes.test.ts` "GET /api/health", "returns 503 when keys are unset" |
| 5 | Mostly | Tests cover 404, 400, and a stored live guide. No explicit test for `GET /api/guides/github` returning curated, though the code handles it (`backend/src/routes/guides.ts` uses `curated.bySlug`) |
| 6 | Done | `routes.test.ts` validation tests + `input.test.ts` (14 tests) |
| 8, 9, 10, 13 | Done | `routes.test.ts`: SSE order, 429 with Retry-After, curated hit not counted, CORS echo/deny, cache hit. AC13 is tested with one variant, not all three |
| 11, 12 | Done | `pipeline.test.ts` (14 tests), `postprocess.test.ts` (20). TIMEOUT is tested at the route level |
| 14 | Done | Build passes (below) |
| 15 | Implemented, not verified | `frontend/vercel.json` catch-all rewrite. Only checkable after deploy |
| 16–20b | Done | `Library.test.tsx`, `GuideView.test.tsx`, `Hero.test.tsx` (AC18), `Generate.test.tsx` (19/20/20a), `GuideDetail.test.tsx` (20b) |
| 21 | Done | Curated guides are bundled (`curatedGuides` chunk). `GuideDetail.tsx` resolves curated slugs before any fetch |
| 22 | Implemented, manual-only | `frontend/src/index.css:73` `@media print`. No automated test |
| 23 | Done | `render.yaml` + `deployFiles.test.ts` |
| 24 | Partial | PDF exists: 0.96 MB, 13 pages, 7 screenshots. Built with `--draft`, and placeholders remain (section 6) |
| 25 | Done | `git grep -nE "sk-[A-Za-z0-9]{20}\|tvly-[A-Za-z0-9]{10}"` gives exit 1 (no matches) |

No AC is missing or stubbed. AC15, AC22, and the keyed half of FR3 can only be verified manually or after deploy.

## 2. Re-run results

- `npm --prefix backend run build`: tsc OK (sync-shared wrote 14 guides to 2 targets).
- `npm --prefix backend test`: 12 files, 115/115 passed.
- `npm --prefix frontend run build`: OK. Main `index` chunk is 70.85 KB gzip. `HeroScene` is a lazy chunk at 248 KB gzip, so the NFR1 budget holds.
- `npm --prefix frontend test`: 8 files, 38/38 passed. The only stderr output is React Router v7 future-flag warnings, which are harmless.
- The local dev servers on :8787 and :5173 were not running, so I made no live probes.

## 3. Live agent readiness

The keyed path is complete end to end:

- `backend/src/server.ts` wires real `createTavily` and `createLlm(createOpenAiClient)` when the keys are present.
- `pipeline.ts` runs resolve → 3 parallel searches → official-first merge/top 10 → extract top 5 (32k char cap) → draft with one repair → verify (non-fatal) → `assembleGuide` (GuideSchema) → `store.put` + `setCache` → `guide` event.
- `routes/generate.ts` adds validation, the curated/cache short-circuit, CONFIG_MISSING, the concurrency slot, the rate limiter, the 120 s AbortController, client-disconnect abort, and `error`/`done` events.
- `sse.ts` flushes headers, sends `X-Accel-Buffering: no`, and pings every 15 s, which is good for proxies.
- Persisted guides are served by `GET /api/guides/:slug` (`guides.ts`, store lookup + schema re-validation).
- On the frontend, `Generate.tsx` `GuideBanner` shows the link `/guides/<slug>` when `persisted`. `GuideDetail.tsx` fetches non-curated slugs from the API, shows a cold-start notice after 4 s, and shows a live-agent disclaimer.
- Slugs get a random suffix (`postprocess.ts:363`), so a forced re-run of a curated app never collides with the curated slug.

Evidence of a real run: none. All LLM/Tavily tests inject stubs (`llm.test.ts`, `pipeline.test.ts`, `upstashStore.test.ts`). There are no live screenshots (`capture-screenshots.mjs` only takes `08/09-generate-*` when `CAPTURE_LIVE=1`), and no notes in `.agents/` of a keyed run.

First-run risks, from most to least likely:

- **Rate-limit IP bucketing on Render (medium).** `TRUST_PROXY=1` (`render.yaml`, `app.ts:32`). If Render's edge adds more than one `X-Forwarded-For` hop, `req.ip` becomes a proxy IP. All reviewers would then share one 5/hour bucket and could hit 429 mid-demo. The code already logs `xffHops` at debug level (`generate.ts`). Fix: after deploy, run once with `LOG_LEVEL=debug` and adjust `TRUST_PROXY`, or raise `RATE_LIMIT_MAX` (e.g. 15–20) for the review window.
- **Structured-output schema rejection (low).** `draftSchema.test.ts` checks strict-mode rules on the JSON schema `zodResponseFormat` generates: no format/min/max/default keywords, all keys required, `additionalProperties:false`. That is the main known pitfall with openai 4.73.0, and it is covered. A 400 still maps cleanly to `LLM_FAILED` (`llm.ts mapProviderError`). The default model `gpt-4o-mini` supports structured outputs.
- **Latency (low–medium).** The draft call times out at 50 s and `maxRetries: 1`, so a slow draft can take about 100 s. Add verify (40 s) and the run can exceed `GENERATION_TIMEOUT_MS=120000`, which shows a clean TIMEOUT. gpt-4o-mini is usually 15–40 s per call, so this is mostly fine. If it bites, raise the timeout to 180000 (the config allows up to 300000).
- **Tavily request shapes look correct.** `tavily.ts` POSTs `/search` and `/extract` with a Bearer token, `search_depth`, `max_results`, `include_domains`, `urls`, `extract_depth`, and reads `results[].raw_content`. Errors 401/403/429/432/433 are mapped. `AbortSignal.any` needs Node ≥20.3, and Render pins 22.
- **CORS (low).** `cors.ts` allows Content-Type/Accept, so the SSE POST preflight works. `Retry-After` is not exposed to the browser, but the client reads `retryAfterSec` from the JSON body, so that's fine.

## 4. Content quality spot check

GitHub, Google Workspace, and Shopify all have every required section:

- difficulty + reason
- handsOn and approvalWait ranges with notes
- prerequisites
- steps with agent/human/assist actors
- recommended and sensitive scopes
- blockers
- agentHandoff (agentCan/humanMust)
- 9 confidence tags
- official sources, checked, `lastVerified 2026-10-20`

Corrected/uncertain counts per guide:

| guide | sources | checked | corrected | uncertain |
|---|---|---|---|---|
| github | 3 | 3 | 0 | 0 |
| google-workspace | 4 | 3 | 1 | 1 |
| shopify | 2 | 3 | 0 | 1 |
| atlassian-jira | 2 | 2 | 0 | 0 |
| linear | 3 | 3 | 0 | 0 |
| salesforce | 2 | 2 | 0 | 2 |
| slack | 3 | 2 | 1 | 0 |

The other 7 guides have at least 1 corrected and 1 uncertain each.

Weak points for the "learned / corrected / could not verify" grading:

- **GitHub, Jira, and Linear have empty corrected and uncertain lists.** GitHub is one of the three PDF sample excerpts. An empty list on a sample looks like the guide wasn't checked critically. There are honest uncertain items available, e.g. GitHub App vs OAuth App recommendation nuance, or the org "third-party application access policy" approval wait being org-controlled and unknowable.
- **Shopify has no corrected entry.**
- **Evidence is thin.** 5 guides cite only 2 sources. Every `accessed` date is the same day.
- **The evidence log could overstate the research.** The "Confirmed …" phrasing reads like page-by-page verification. Per requirements A4, guides were authored from documentation knowledge plus the link-check pass. The global section of `08-evidence-log.md` is good. Consider one sentence stating exactly what "confirmed" means: URL resolves, and the claim matches the page as read on the date.

## 5. README.md

Covered: architecture, local dev, the env var table, testing commands, Render Blueprint deploy (including `ALLOWED_ORIGINS`), Vercel deploy (Root Directory `frontend`, `VITE_API_URL`, "Include source files outside of the Root Directory" ON), UptimeRobot, Upstash, adding a guide, and PDF build steps.

Missing, though the assignment asks for setup, key decisions, and limitations:

- No **Key decisions** section. Candidates: split Vercel/Render for SSE without serverless limits, a shared zod schema, curated guides bundled into the frontend, the LLM producing only a draft followed by deterministic post-processing, grounding to retrieved URLs, rate limit + concurrency cap.
- No **Limitations** section. `submission/content/09-limitations.md` exists and could be condensed into the README.
- No **What was tested / verification** section (test counts, link-check result, what remains unverified).
- No **Live demo** links at the top.
- No explicit statement that the live path is only tested with mocks (until a real run happens).

Placeholders: the README itself has none to fill, only generic `<your-render-service>` text.

## 6. PDF

- `submission/Composio_OAuth_Guide_Agent_Submission.pdf`: 1,010,227 bytes (0.96 MB), 13 pages (counted from `/Type /Page`), written 2026-10-23 03:22.
- Sections come from `submission/content/01..11` plus a title page: problem, scope, how it works (inline SVG), guide format, samples (GitHub/Google/Shopify), live agent, use of agents, evidence log (link-check table), limitations, future, screenshots. The Loom guard is in `build-pdf.mjs:263`.
- Placeholders in `submission/links.config.json`: `VERCEL_URL=https://YOUR-APP.vercel.app`, `RENDER_URL=https://YOUR-API.onrender.com`, `REPO_URL=https://github.com/YOUR-USER/YOUR-REPO`. `SUBMISSION_DATE` is null, which defaults to the build date. The title page renders these as clickable links, so the current PDF contains dead links.
- Screenshots: 7 total. `07-generate-idle.jpg` shows the input disabled with "Live generation isn't configured for this deployment." That means the preview build had no `VITE_API_URL`, so `apiConfigured=false` in `frontend/src/lib/api.ts`. There is no streaming or result screenshot.
- The live flow is explained in text in `06-live-agent.md`. Two small inaccuracies there:
  - It says CONFIG_MISSING is "streamed as an error event". Per AC7 and `generate.ts requireConfig`, it is a 503 JSON response sent before any stream.
  - Its step labels ("Searching official docs…", "Assembling and validating…") don't match the real labels in `pipeline.ts` ("Searching docs…", "Drafting guide…", "Verifying claims…", "Saving shareable guide…").
- **Bug in the live screenshot path:** `capture-screenshots.mjs` calls `currentPage.$x(...)`. Puppeteer 22 removed `Page.$x`, and the repo uses puppeteer 23.9.0. The call throws a TypeError synchronously, outside the `.catch`, so `CAPTURE_LIVE=1` crashes before it takes `08-generate-streaming.jpg`. Fix: `await currentPage.$('::-p-xpath(//button[contains(., "Generate")])')` or a `button[type=submit]` selector.

## 7. Deployment readiness

- **Render (`render.yaml`).** No `rootDir` is set. That's correct: build and start `cd backend`, and the full repo is cloned, so `backend` prebuild → `node ../scripts/sync-shared.mjs` → `../shared` resolves. `sync-shared.mjs` has no dependencies.
  - `npm ci --include=dev` installs tsc even with `NODE_ENV=production`.
  - Start command is `node dist/server.js`. `healthCheckPath: /api/health`, `NODE_VERSION=22`, `engines >=20.3 <23`.
  - Secrets are `sync: false`: ALLOWED_ORIGINS, OPENAI_API_KEY, TAVILY_API_KEY, UPSTASH_*. `PORT=10000`.
  - `config.ts` treats blank values as unset, so blank Upstash secrets are fine. Setting only one of the two Upstash vars is fatal at boot, by design.
  - Nothing here would break.
- **Vercel (`frontend/vercel.json`).** The SPA rewrite `/(.*)` → `/index.html` is fine because Vercel serves real files first. Asset caching is immutable.
  - Root Directory must be `frontend`.
  - "Include source files outside of the Root Directory in the Build Step" must be ON, or prebuild fails. `sync-shared.mjs` prints a clear message pointing to that setting. Vercel docs confirm the setting is needed to read outside the root ([Monorepos FAQ](https://vercel.com/docs/monorepos/monorepo-faq)). The README documents it.
  - **`VITE_API_URL` must be set before the build.** Vite inlines it at build time. Without it, the production build has `apiConfigured=false` and the Generate page is permanently disabled, as in screenshot 07. Changing the env var later requires a redeploy.
- **Persistence.** `STORE=auto` falls back to the file store at `./.data`. Render docs say local file changes are lost when a service redeploys **or restarts** ([Render disks](https://docs.render.com/disks)). Free services spin down after 15 idle minutes ([Render free](https://render.com/docs/free)), and spin-down counts as a restart. So without Upstash, a shareable live link breaks after about 15 minutes of inactivity unless UptimeRobot keeps the service warm. README and `09-limitations.md` say "wiped on redeploy", which understates this.

## 8. Repo hygiene

- `.gitignore` excludes `frontend/src/generated/`, `backend/src/generated/`, `backend/.data/`, `dist/`, `.env*` (keeping `.env.example`), and the screenshot temp dirs. `git ls-files` shows none of them tracked (184 files).
- Generated files are recreated by the `pre{build,test,dev,typecheck}` hooks on both Render and Vercel, so they are correctly left out of git.
- Committed binaries are reasonable: the PDF (~1 MB) and 7 JPEG screenshots. Lockfiles for backend, frontend, and submission are committed. Versions are exact, with `save-exact=true` in `.npmrc`.
- `.agents/tasks/*` is committed. That's fine, and it shows the "use of agents" process, but it will be visible in the public repo.

---

## Prioritized conclusions

### (a) Blockers for the reviewer demo (nothing blocks the build)

1. **Live generation has never run with real keys.** Deploy the backend with `OPENAI_API_KEY` and `TAVILY_API_KEY`, then run 2–3 unfamiliar apps (e.g. Asana, Dropbox, Calendly). Confirm the stream, the guide, and that `/guides/<slug>` loads in a fresh tab.
2. **Vercel `VITE_API_URL` must be set before the build, and Render `ALLOWED_ORIGINS` must equal the exact Vercel origin.** No trailing slash is needed; the code strips it. If either is wrong, the live demo is dead (disabled input or CORS block).
3. **Shareable live links are not durable without Upstash.** They break on the first spin-down or restart. Configure free Upstash Redis (both vars), or at minimum run UptimeRobot every 10 minutes.
4. **The PDF must be rebuilt without `--draft`** after filling in `links.config.json`. The current PDF has dead `YOUR-...` links on its title page.

### (b) Gaps against the assignment worth fixing (small edits)

1. README: add Live links, Key decisions, What was tested / verified, and Limitations sections. The assignment requires them in the README itself.
2. Fill in honest `corrected`/`uncertain` entries for `github.json` (a PDF sample), `atlassian-jira.json`, `linear.json`, and a `corrected` entry for `shopify.json`. Then re-run `npm --prefix backend test` and the PDF build.
3. Capture real live-generation screenshots: streaming timeline, result, and the share link. First fix the `$x` call in `submission/capture-screenshots.mjs`, then run against the deployed URLs: `BASE_URL=<vercel> API_URL=<render> CAPTURE_LIVE=1`. Replace the disabled `07-generate-idle.jpg` with a shot from a build that has `VITE_API_URL` set. Optionally add a short "live run log" to `08-evidence-log.md`: apps tried, duration, sources found, what the verifier flagged.
4. Fix `06-live-agent.md`: CONFIG_MISSING is a 503 JSON response before the stream, not a streamed event, and the step labels should match `pipeline.ts`.
5. In README and `09-limitations.md`, say the file store is wiped on restart and spin-down, not only on redeploy.
6. Until item (a)1 is done, state in the PDF and README that the live path is covered by mocked tests only.

### (c) Steps only the user can do

1. Push the repo to GitHub (public), then set `REPO_URL`.
2. Get OpenAI and Tavily keys. Optionally create an Upstash Redis database.
3. Render: New Blueprint from `render.yaml`. Set the secrets. Wait for `/api/health` to show `llmConfigured:true, searchConfigured:true`.
4. Vercel: import the repo, set Root Directory `frontend`, turn ON "include files outside root", set `VITE_API_URL=https://<render>.onrender.com`, deploy.
5. Set Render `ALLOWED_ORIGINS=https://<app>.vercel.app` and redeploy or restart.
6. Check `TRUST_PROXY` (debug log `xffHops`), and consider `RATE_LIMIT_MAX` around 15 for the review window.
7. Set up an UptimeRobot monitor on `/api/health` every 10 minutes. Wake the service right before submitting.
8. Fill in `submission/links.config.json` (all three URLs, optionally `SUBMISSION_DATE`). Run `npm --prefix submission run screenshots` against the deployed site, then `npm --prefix submission run pdf` without draft. Confirm it is under 10 MB.
9. Upload the PDF to the Google Form.

### (d) Nice-to-haves

- Add a test for `GET /api/guides/github` returning the curated guide (AC5), plus the "asana.com" and " ASANA " cache variants (AC13).
- Add a third official source to the 2-source guides (Jira, HubSpot, Microsoft Entra, Salesforce, Shopify, Stripe Connect, Zoom, Discord, Notion).
- Opt into React Router v7 future flags to silence test warnings.
- Consider raising `GENERATION_TIMEOUT_MS` to 180000 on Render for headroom on slow LLM calls.
