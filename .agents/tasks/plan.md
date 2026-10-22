# Implementation Plan: OAuth App Approval Guide Agent

This plan is the authoritative, ordered build sequence. It conforms exactly to
`c:\Users\yadav\OneDrive\Desktop\Composio_Assignment\.agents\tasks\requirements.md` (ACs 1-25) and
`c:\Users\yadav\OneDrive\Desktop\Composio_Assignment\.agents\tasks\design.md` (revision 3). All dependency
versions are PINNED exactly as in design.md; use them verbatim with `save-exact=true` and commit lockfiles.
Do NOT reopen design or requirements. Do NOT commit or push. Do NOT create a git worktree.

Environment: Windows, PowerShell 5.1. Use `;` not `&&` in the shell. Never run dev servers/watchers in the
foreground — start them as background processes, probe, then stop. Prefer `npm --prefix <dir> run <script>`
over `cd`. Node v22.21.0 / npm 10.9.4 are installed. Current date for authoring/verification: 2026-10-20.

Three MEDIUM design-review findings and the NIT fixes from the build brief are folded in as implementation
details below (see items 11, 20, 24, 25, 32 especially). They are not re-decided here.

All paths are absolute under `c:\Users\yadav\OneDrive\Desktop\Composio_Assignment` (abbreviated `<ROOT>` below).

---

## Phase A — Shared schema, sync tooling, link checker, root scaffolding

- [ ] 1. Create the root convenience `package.json` and `.gitignore` edits.
      Root `package.json` is `{ "private": true, "scripts": { "sync", "check:links", "pdf", "screenshots" } }`
      exactly as in design.md "Root package.json" (no dependencies). Edit `.gitignore`: add
      `frontend/src/generated/`, `backend/src/generated/`, `backend/.data/`; replace the three lines
      `.env`, `.env.local`, `.env.*.local` with `.env*` immediately followed by `!.env.example`
      (order matters — negation after the wildcard).
      Files: `<ROOT>/package.json`, `<ROOT>/.gitignore`
      Verify: `node -e "require('./package.json')"` from `<ROOT>` exits 0; `git check-ignore -v frontend/src/generated/x`
      reports a match and `git check-ignore -v backend/.env.example` reports NO match (exit 1).

- [ ] 2. Author the canonical shared schema `shared/schema.ts`.
      Transcribe the full zod schema from design.md "Guide schema": constants (`SCHEMA_VERSION`, `Difficulty`,
      `Confidence`, `Actor`, `Category`, `ReviewType`, `ScopeLevel`, `SECTION_KEYS`), helpers (`Str`, `HttpsUrl`,
      `IsoDate` with round-trip date refine, `DurationRange`, `SectionConfidence`, `Source`), the full `GuideSchema`
      with the two `superRefine` checks (supported ⇒ ≥1 step; sourceRefs in range), the exported types
      (`Guide`, `GuideInput`, `SectionKey`, `GuideSummary`), `toSummary`, `CONFIDENCE_RANK`, and the entire wire
      protocol block (`ErrorCode`, `ClientErrorCode`, `Stage`, `StepStatus`, `StreamEvent` union, `StreamEventName`,
      `ApiErrorBody`). Imports only `zod`.
      Files: `<ROOT>/shared/schema.ts`
      Verify: covered by backend typecheck/tests in Phase B (item 10). No standalone build yet.

- [ ] 3. Write `scripts/sync-shared.mjs` (node:fs/node:path only, zero deps).
      For each target (`frontend/src/generated`, `backend/src/generated`): mkdir; copy `shared/schema.ts` →
      `schema.ts` with the AUTO-GENERATED header; read every `shared/guides/*.json`, `JSON.parse` each (exit 1 with
      filename on parse error), assert filename stem === `slug` (exit 1 if not); write `curatedGuides.ts` that
      imports `./schema.js` and parses a `GuideInput[]` literal (guides sorted by `app.name`) with
      `GuideSchema.parse`. If `shared/` is missing, exit 1 with the Vercel "Include source files outside of the Root
      Directory" message from design.md.
      Files: `<ROOT>/scripts/sync-shared.mjs`
      Verify: `node scripts/sync-shared.mjs` from `<ROOT>` exits 0 after guides exist (re-verified in item 15); with
      guides absent it still creates `schema.ts` copies and a `curatedGuides.ts` with an empty array.

- [ ] 4. Write `scripts/check-links.mjs` (zero deps).
      Implement exactly per design.md "scripts/check-links.mjs": collect every URL from `shared/guides/*.json`
      (`verification.sources[].url`, `steps[].consoleUrl`, `app.website`), dedupe keeping `guides: string[]`,
      concurrency-4 worker pool, ref'd `setTimeout`+`AbortController` (15s), browser `User-Agent`, cancel bodies,
      `classifyResponse` order blocked→broken→redirected→ok, `normalize(u)` rules, assert
      `results.length === urls.length` (exit 1 + list missing), write `shared/link-check-report.json`
      (`{ checkedAt, results: [...] }`), print a table + per-status counts, exit 1 on any `broken` or missing else 0.
      Files: `<ROOT>/scripts/check-links.mjs`
      Verify: `node scripts/check-links.mjs` runs and writes `shared/link-check-report.json` after guides exist
      (re-run in item 16). Exits 0 when no broken URLs. (AC 3)

## Phase B — Backend: config, app, routes, store, agent pipeline

- [ ] 5. Scaffold the backend package.
      Create `backend/package.json` (`"type": "module"`, engines `>=20.3 <23`, exact deps and scripts from
      design.md), `backend/.npmrc` (`save-exact=true`), `backend/tsconfig.json` (NodeNext, ES2022, strict,
      rootDir src, skipLibCheck), `backend/vitest.config.ts` (node env, `include: ['test/**/*.test.ts']`).
      Run the sync so `src/generated/` exists, then `npm install` to produce the lockfile.
      Files: `<ROOT>/backend/package.json`, `<ROOT>/backend/.npmrc`, `<ROOT>/backend/tsconfig.json`,
      `<ROOT>/backend/vitest.config.ts`
      Verify: `npm --prefix backend install` exits 0 and writes `backend/package-lock.json`;
      `npm --prefix backend run typecheck` runs (may fail only because source files are not yet written).

- [ ] 6. Implement foundation modules: config, log, errors, sse, curated.
      `src/config.ts` (zod env parse with blank→undefined pre-pass, fatal on invalid, `CONFIG_KEYS` export of all 17
      names, `llmConfigured`/`searchConfigured`, localhost-only production warn), `src/log.ts` (JSON-lines logger,
      never logs secrets/content), `src/errors.ts` (`ServerErrorCode`, `AgentError`, `toWire`), `src/sse.ts`
      (`openSse`, `SseWriter`, heartbeat, `buildMeta`), `src/curated.ts` (`CuratedIndex`: bySlug, byKey, summaries,
      `match`, `officialDomainsFor`, boot-time `GuideSchema.parse`).
      Files: `<ROOT>/backend/src/config.ts`, `log.ts`, `errors.ts`, `sse.ts`, `curated.ts` (all under `src/`)
      Verify: `npm --prefix backend run typecheck` passes for these modules (full pass gated on item 9).

- [ ] 7. Implement the store layer.
      `src/store/types.ts` (`GuideStore` interface), `memoryStore.ts`, `fileStore.ts` (atomic tmp+rename, promise
      mutex, corrupt-file handling, TTL expiry), `upstashStore.ts` (injected Redis-like interface; real `Redis`
      built only in `createStore`), `index.ts` (`createStore`, STORE=upstash with no creds is fatal). Every `get`
      does `GuideSchema.safeParse` and returns null on failure (store owns re-validation).
      Files: `<ROOT>/backend/src/store/{types,memoryStore,fileStore,upstashStore,index}.ts`
      Verify: `npm --prefix backend test -- fileStore upstashStore` passes after tests exist (item 10); typecheck
      passes now.

- [ ] 8. Implement the agent pipeline modules.
      `src/agent/input.ts` (`normalizeAppInput` 6 rules incl. control-char reject first, one message
      "Enter a public app name or developer docs URL (max 200 characters)." per NIT), `sources.ts`
      (`registrableDomain`, `brandTokens`, `classifySource`, `GENERIC_TOKENS`), `tavily.ts`
      (`search`/`extract` via global fetch, `AbortSignal.any` + per-call timeout, HTTP error mapping),
      `draftSchema.ts` (`GuideDraftSchema`, `VerificationSchema` strict-mode), `prompts.ts`, `llm.ts`
      (`createLlm` → `{draft, verify}`, `DraftInvalid` exported, `LengthFinishReasonError`/
      `ContentFilterFinishReasonError` from `openai/error`, per-request timeouts 50s/40s), `postprocess.ts`
      (`normalizeDraft` 8 rules, `slugify`, `assembleGuide`, `clampToSchemaLimits`), `pipeline.ts` (`runPipeline`
      with the 7 stages, repair-retry at most once, verify exactly once, abort checks).
      Fold finding #2 (normalization null/empty→undefined, `normalizeVerification`, confidence-note source rule,
      prepend pipeline notes before truncating uncertain to 15) and finding #3 (repair-retry via
      `assembleGuide(verification:null)` probe, re-emit draft step active with detail, final failure → `LLM_FAILED`,
      `DraftInvalid` caught by `instanceof`).
      Files: `<ROOT>/backend/src/agent/{input,sources,tavily,draftSchema,prompts,llm,postprocess,pipeline}.ts`
      Verify: `npm --prefix backend run typecheck` passes.

- [ ] 9. Implement HTTP composition: middleware, routes, app, server.
      `src/middleware/{cors,rateLimit,concurrency,errorHandler,asyncHandler}.ts`; `src/routes/{health,guides,generate}.ts`
      (generate as the 7-middleware chain; health exposes `rateLimitMax` per NIT; guides validates
      `GET /api/guides/:slug` response and `listRecent` output with zod per NIT); `src/app.ts` (`createApp(deps)`,
      middleware order, helmet, cors, 404, errorHandler); `src/server.ts` (config, build real deps incl. stub
      LLM/search deps that throw `CONFIG_MISSING` when keys missing, OpenAI client only when configured, SIGTERM
      handling). `/api/generate` gets the 90s headers timeout mapped to NETWORK, cleared on first byte (client side
      item 24); server side keeps the 120s generation timeout → TIMEOUT.
      Files: `<ROOT>/backend/src/middleware/*.ts`, `src/routes/*.ts`, `src/app.ts`, `src/server.ts`
      Verify: `npm --prefix backend run build` succeeds (tsc, zero errors).

- [ ] 10. Write the full backend test suite.
      Add `test/{curated,input,postprocess,draftSchema,errors,pipeline,routes,sources,deployFiles,llm,fileStore,upstashStore}.test.ts`
      exactly per design.md "Testing strategy". Include the normalization unit tests from finding #2 and the
      repair-retry assertions from finding #3 in `postprocess`/`pipeline` tests. `deployFiles.test.ts` is written now
      but fully asserted in Phase E once `render.yaml`/`.env.example` exist (keep it green by creating those files in
      item 28 before the final loop).
      Files: `<ROOT>/backend/test/*.test.ts`
      Verify: `npm --prefix backend test` passes all tests except `deployFiles` (which passes after item 28).
      (ACs 4-13)

## Phase C — Curated guide content (14 guides) + link verification

- [ ] 11. Research and author all 14 curated guide JSON files.
      For each slug in design.md "Curated guide content plan" (`github`, `google-workspace`, `slack`, `notion`,
      `stripe-connect`, `shopify`, `discord`, `zoom`, `salesforce`, `hubspot`, `microsoft-entra`, `atlassian-jira`,
      `linear`, `figma`): research against official docs via web search/fetch using the canonical URL table in
      design.md; cite only URLs actually found/fetched (never invent URLs); fill every schema field; set per-section
      confidence honestly (approval-wait = `community` unless an official page states it; Figma review = `uncertain`
      encoding). Keep the fixed difficulties: GitHub=Easy, Google=Very Hard, Shopify=Hard; all four levels present.
      Add `aliases` including normalized keys of common phrasings ("Microsoft Entra ID"→entra/azuread, "Azure AD",
      "Atlassian Jira"→jira/atlassian, "Jira") so curated apps never trigger a paid live run (NIT). `lastVerified`
      and `accessed` dates on/after 2026-10-20; `generatedBy: 'curated'`; `generatedAt` UTC with `Z`.
      Files: `<ROOT>/shared/guides/{github,google-workspace,slack,notion,stripe-connect,shopify,discord,zoom,salesforce,hubspot,microsoft-entra,atlassian-jira,linear,figma}.json`
      Verify: `npm --prefix backend test -- curated` passes (all 14 valid, unique slugs, ≥2 sources ≥1 official, all
      https, valid dates, GitHub/Google/Shopify difficulties, all 4 levels, every `verified` section has an official
      sourceRef). (ACs 1, 2)

- [ ] 12. Re-sync and run the link checker; fix any broken/redirected URLs.
      Run the sync so generated copies include all 14 guides, then run `check-links`. Replace any `broken` URL,
      update any `redirected` URL to its final URL (after confirming the page still supports the claim), and
      downgrade any section citing only failed URLs below `verified`. Record corrections for the evidence log
      (consumed by the PDF in Phase E).
      Files: `<ROOT>/shared/guides/*.json` (as needed), `<ROOT>/shared/link-check-report.json` (generated)
      Verify: `node scripts/sync-shared.mjs` exits 0; `node scripts/check-links.mjs` exits 0 (zero broken, zero
      missing) and ideally zero redirected before submission. (AC 3)

## Phase D — Frontend SPA (React + Vite + Tailwind + R3F)

- [ ] 13. Scaffold the frontend package and config.
      Create `frontend/package.json` (`"type": "module"`, exact deps/scripts), `.npmrc` (`save-exact=true`),
      `tsconfig.json` (bundler resolution, skipLibCheck, jsx react-jsx), `vite.config.ts` (react plugin,
      es2020 target, chunkSizeWarningLimit 1200, ports 5173/4173), `vitest.config.ts` (jsdom, globals, setup file,
      AND include the React plugin per NIT), `tailwind.config.ts`, `postcss.config.js`, `index.html`,
      `public/favicon.svg`, `src/test/setup.ts` (jest-dom + matchMedia/IO/getContext stubs). Run sync, then install.
      Files: `<ROOT>/frontend/{package.json,.npmrc,tsconfig.json,vite.config.ts,vitest.config.ts,tailwind.config.ts,postcss.config.js,index.html}`,
      `<ROOT>/frontend/public/favicon.svg`, `<ROOT>/frontend/src/test/setup.ts`
      Verify: `npm --prefix frontend install` exits 0 and writes `frontend/package-lock.json`.

- [ ] 14. Implement `src/lib` utilities.
      `api.ts` (`API_BASE`, `apiConfigured`, `ApiError`, `getJson` with timeout→NETWORK), `errors.ts`
      (`describeError` table incl. rate-limit hint rendering `rateLimitMax`), `stream.ts` (`streamGenerate`,
      eventsource-parser, `GuideSchema.safeParse` on guide → BAD_RESPONSE, STREAM_INTERRUPTED synth; ignore events
      after first terminal event and treat "guide received but no done" as complete per NIT), `guides.ts`
      (`loadCurated`, summaries, `searchSummaries` with alias normalization), `time.ts`, `webgl.ts`, `cn.ts`,
      `useInView.ts`.
      Files: `<ROOT>/frontend/src/lib/{api,errors,stream,guides,time,webgl,cn,useInView}.ts`
      Verify: `npm --prefix frontend test -- errors time stream` passes after component shells exist (item 18).

- [ ] 15. Implement layout, UI primitives, and the 3D hero.
      `components/layout/{Navbar,Footer,PageShell,ErrorBoundary}`, `components/ui/*` (GlassCard, Button, Input,
      Badge, DifficultyBadge, ActorBadge, ConfidenceTag, Meter, Accordion, Toast, Skeleton, ErrorState, TiltCard,
      ColdStartNotice with exact "Waking up the agent server…" text), `components/three/{Hero,HeroScene,HeroFallback}`
      (lazy HeroScene, drei import allow-list only, capability gate, aria-hidden, fallback SVG).
      Files: `<ROOT>/frontend/src/components/layout/*.tsx`, `ui/*.tsx`, `three/*.tsx`
      Verify: `npm --prefix frontend run typecheck` passes.

- [ ] 16. Implement guide and generate components.
      `components/guide/{GuideView,GuideHeader,TimeEstimate,ApprovalTimeline,Prerequisites,StepList,ScopesPanel,BlockersAccordion,AgentHandoff,SourcesPanel,GuideToc,GuideCard}`
      (nine ConfidenceTags with `data-testid="confidence-<key>"`, no tag on Summary/Sources; copy-share;
      print-friendly), `components/generate/{GenerateForm,ActivityTimeline}` (aria-live timeline; input validation
      message mirrors server; Force-fresh checkbox after curated/cache hit).
      Files: `<ROOT>/frontend/src/components/guide/*.tsx`, `generate/*.tsx`
      Verify: `npm --prefix frontend run typecheck` passes.

- [ ] 17. Implement pages and app shell.
      `pages/{Landing,Library,GuideDetail,Generate,About,NotFound}`, `App.tsx` (createBrowserRouter, lazy + Suspense
      + ErrorBoundary per route), `main.tsx`, `index.css` (visual system + `@media print` rules). GuideDetail and
      Generate use the 4s cold-start notice and the error flows from `describeError`; Generate calls `/api/health`
      once on mount and shows the "Live research isn't configured" banner when unconfigured while keeping the input
      usable (per NIT); permalink 400/404 → "Guide not found" no retry (item 24).
      Files: `<ROOT>/frontend/src/pages/*.tsx`, `<ROOT>/frontend/src/{App,main}.tsx`, `<ROOT>/frontend/src/index.css`
      Verify: `npm --prefix frontend run build` succeeds with zero TypeScript errors. (AC 14)

- [ ] 18. Write the frontend test suite.
      `Library.test.tsx`, `errors.test.ts`, `GuideDetail.test.tsx`, `Hero.test.tsx`, `stream.test.ts`,
      `Generate.test.tsx`, `GuideView.test.tsx`, `time.test.ts` exactly per design.md "Testing strategy" (ACs 16-20).
      Files: `<ROOT>/frontend/src/**/*.test.{ts,tsx}`
      Verify: `npm --prefix frontend test` passes all tests.

## Phase E — Deployment artifacts, README, and submission PDF pipeline

- [ ] 19. Author deployment files and README.
      `frontend/vercel.json` (SPA rewrites + headers), `frontend/.env.example` (`VITE_API_URL`),
      root `render.yaml` (web service, build `cd backend && npm ci --include=dev && npm run build`, start
      `cd backend && npm start`, `healthCheckPath: /api/health`, every `.env.example` key as `- key:` with secrets
      `sync: false`), `backend/.env.example` (17 keys, fixed parseable format), root `README.md` (local dev with
      `npm --prefix` commands ONE PER LINE no `&&` per NIT, env table, deploy steps, UptimeRobot tip, PDF steps).
      Files: `<ROOT>/frontend/vercel.json`, `<ROOT>/frontend/.env.example`, `<ROOT>/render.yaml`,
      `<ROOT>/backend/.env.example`, `<ROOT>/README.md`
      Verify: `npm --prefix backend test -- deployFiles` passes (`.env.example` ⊆ `render.yaml` keys, `CONFIG_KEYS`
      equals `.env.example` keys, no key-shaped secrets, build/start/health strings present). (ACs 23, 25)

- [ ] 20. Implement the submission PDF pipeline.
      `submission/package.json` (`puppeteer` 23.9.0, `marked` 15.0.2, scripts), `.npmrc`, `links.config.json`,
      `content/01..11*.md` (11 files), `assets/architecture.svg`, `assets/pdf.css`, `build-pdf.mjs`,
      `capture-screenshots.mjs`. `build-pdf.mjs` uses TWO-PHASE token replacement (finding #1): replace inline
      config tokens BEFORE `marked` (HTML-escaped); replace block tokens (`ARCHITECTURE_SVG`, `SAMPLE_GUIDES`,
      `LINK_CHECK_TABLE`, `SCREENSHOTS`) AFTER `marked` by swapping the `<p>{{KEY}}</p>` wrappers with raw HTML. Then
      FAIL the build if any `{{...}}` token is unreplaced, if `&lt;svg` / `&lt;table` / `&lt;figure` appear escaped,
      or if the architecture section lacks a closing `</svg>`. Keep the existing post-checks (size <10MB, REQUIRED
      section ids, `<svg` inside how-it-works). Loom-absence check strips `data:image` base64 before scanning for
      `\bloom\b` (NIT). All paths anchored to `fileURLToPath(import.meta.url)`.
      Files: `<ROOT>/submission/package.json`, `.npmrc`, `links.config.json`, `content/*.md`, `assets/architecture.svg`,
      `assets/pdf.css`, `build-pdf.mjs`, `capture-screenshots.mjs`
      Verify: `npm --prefix submission install` exits 0; `node submission/build-pdf.mjs --draft` produces a PDF and
      the token/escape/`</svg>` guards pass (placeholders only warn in draft). (AC 24 proper build runs in PDF phase)

## Phase F — Cross-cutting verification

- [ ] 21. Full green build across all packages.
      Run sync, then backend build+test, frontend build+test, and the link checker. Capture screenshots against a
      backgrounded `vite preview`, then build the final PDF (non-draft) once `links.config.json` is filled (or
      `--draft` if links are still placeholders at build time).
      Files: none (verification only; may touch files to fix failures)
      Verify, each must pass:
      - `node scripts/sync-shared.mjs` (exit 0)
      - `npm --prefix backend run build` (exit 0) and `npm --prefix backend test` (all pass)
      - `npm --prefix frontend run build` (exit 0) and `npm --prefix frontend test` (all pass)
      - `node scripts/check-links.mjs` (exit 0) (AC 3)
      - a deep-link check of `/guides/github` against a backgrounded `vite preview` on :4173 returns the guide HTML
        (AC 15), then stop the preview process
      - `git grep -nE "sk-[A-Za-z0-9]{20}|tvly-[A-Za-z0-9]{10}"` returns nothing (AC 25)

---

## Notes and assumptions

- Live deploy URLs are unknown at build time; the PDF reads them from `submission/links.config.json` placeholders.
  The final non-draft PDF build may be deferred until the user fills those in; `--draft` keeps the pipeline green
  meanwhile. This matches requirements assumption A2.
- API keys are not required to build, test, or serve the curated library. Live generation returns
  `503 CONFIG_MISSING` without keys (A1, FR7).
- Every verification step uses the project's real `npm`/`node` commands discovered in design.md, never grep-for-text
  (the one `git grep` check is the AC 25 secret-scan, which is itself an acceptance criterion).
