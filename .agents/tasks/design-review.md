# Design Review: OAuth App Approval Guide Agent

Reviewed: `.agents/tasks/design.md` against `.agents/tasks/requirements.md`.

Verdict: **CHANGES_REQUESTED** (1 HIGH, 12 MEDIUM, 12 NIT)

The design is strong overall. The dependency set resolves cleanly and the 3D stack builds, but several contracts (generated import paths, LLM draft schema, StreamEvent shape, PDF section ids) are either wrong or underspecified enough to misdirect the implementer.

## How assumptions were checked

- `npm view <pkg>@<ver> peerDependencies` for drei, fiber, openai, testing-library/react, plugin-react, vitest, lucide-react, framer-motion, eventsource-parser.
- `npm install --package-lock-only` dry-run resolution of the exact frontend, backend, and submission sets in throwaway temp dirs (all exit 0, no ERESOLVE).
- Full `npm ci` of the frontend set, then a probe `.tsx` using `Canvas`, `useFrame`, `Float`, `RoundedBox`, `Line` (dashed, `dashOffset`), `Sparkles`, `Environment` + `Lightformer`, `meshPhysicalMaterial`, `frameloop="never"`, and `eventsource-parser` v3 `createParser({ onEvent })`. Ran `tsc` (with and without `skipLibCheck`) and `vite build`.
- Full `npm ci` of the backend set, then a probe of `openai/helpers/zod` `zodResponseFormat`, `client.beta.chat.completions.parse`, and the `express-rate-limit` exports.
- `marked` 15.0.2 heading output.
- Temp dirs were deleted afterwards.

## Findings

### 1. HIGH: Generated `curatedGuides.ts` imports `'./schema'`, which fails the backend `tsc` build under NodeNext
Where: "Shared code: sync-shared decision", the generated file template, together with "Deployment files" (backend tsconfig `module`/`moduleResolution: NodeNext`, "Relative imports carry `.js` extensions").
Problem: under `moduleResolution: NodeNext`, an extensionless relative import is error TS2835. The Render build (`npm run build` = `tsc`) would fail, and so would AC 14's backend counterpart and every backend test that imports the generated file through `tsc`.
Fix: have the sync script emit the `.js` form for both targets. TS `bundler` resolution and Vite both resolve `./schema.js` to `schema.ts`:
```ts
import { GuideSchema, type GuideInput, type Guide } from './schema.js';
```
Also state in the design: "Backend source imports generated files as `./generated/schema.js` / `./generated/curatedGuides.js`."

### 2. MEDIUM: Frontend tsconfig isn't specified, and `skipLibCheck: false` breaks the build with this exact pin set
Where: "Technology stack (locked)" and frontend layout (`tsconfig.json` listed, contents never given). AC 14 requires zero TS errors.
Verified: drei 9.117.3 pulls in `hls.js` through a caret range. The lockfile resolves a current `hls.js` whose `.d.mts` uses `Uint8Array<…>` generics (TS ≥ 5.7). With `typescript` 5.6.3 and `skipLibCheck: false`, `tsc` emits dozens of `TS2315: Type 'Uint8Array' is not generic` errors. With `skipLibCheck: true`, the probe type-checks cleanly.
Fix: specify the frontend tsconfig explicitly:
```json
{ "compilerOptions": { "target": "ES2020", "lib": ["ES2020","DOM","DOM.Iterable"], "module": "ESNext",
  "moduleResolution": "bundler", "jsx": "react-jsx", "strict": true, "noEmit": true,
  "skipLibCheck": true, "resolveJsonModule": true, "isolatedModules": true,
  "types": ["vite/client", "vitest/globals", "@testing-library/jest-dom"] },
  "include": ["src"] }
```
Also give the frontend scripts: `"build": "tsc -p tsconfig.json && vite build"`, `"typecheck": "tsc -p tsconfig.json"`, `"test": "vitest run"`, `"preview": "vite preview"`. Do the same for the backend: `"test": "vitest run"`, `"typecheck": "tsc -p tsconfig.json --noEmit"`, with `include: ["src"]` so `test/` doesn't violate `rootDir: src`.

### 3. MEDIUM: `GuideDraftSchema` is contradictory and underspecified
Where: "Stage 6 / GuideDraftSchema" paragraph.
Problem: it says the draft "mirrors GuideSchema" but also that "every section gets `confidence: { level, note, sourceIndexes }`". `GuideSchema` has a single top-level `confidence` map keyed by `SECTION_KEYS`, and several sections (`steps`, `prerequisites`, `blockers`) are arrays that can't carry a `confidence` field. An implementer has to guess the LLM contract, which is the core of live generation.
Fix: define it explicitly in the design:
```ts
const DRange = z.object({ min: z.number(), max: z.number(), unit: z.enum(['minutes','hours','days','weeks']), note: z.string().nullable() });
const DConf = z.object({ level: Confidence, note: z.string().nullable(), sourceIndexes: z.array(z.number().int()) });
export const GuideDraftSchema = z.object({
  app: z.object({ name: z.string(), website: z.string().nullable(), category: Category,
    brand: z.object({ color: z.string(), monogram: z.string() }) }),
  summary: z.string(),
  oauthAvailability: z.object({ status: z.enum(['supported','not-supported','unclear']), note: z.string().nullable(), alternatives: z.array(z.string()) }),
  difficulty: z.object({ level: Difficulty, reason: z.string() }),
  timeEstimate: z.object({ handsOn: DRange, approvalWait: DRange, criticalPath: z.string() }),
  review: z.object({ required: z.boolean(), requiredWhen: z.string(), types: z.array(ReviewType),
    stages: z.array(z.object({ name: z.string(), actor: Actor, duration: DRange, description: z.string() })) }),
  prerequisites: z.array(z.object({ item: z.string(), detail: z.string().nullable(), actor: Actor })),
  steps: z.array(z.object({ title: z.string(), detail: z.string(), consoleUrl: z.string().nullable(), actor: Actor,
    estimate: z.string().nullable(), gotcha: z.string().nullable() })),
  redirectUris: z.object({ notes: z.array(z.string()), examples: z.array(z.string()) }),
  scopes: z.object({ recommended: z.array(z.object({ scope: z.string(), purpose: z.string() })),
    sensitive: z.array(z.object({ scope: z.string(), level: ScopeLevel, consequence: z.string() })), notes: z.array(z.string()) }),
  blockers: z.array(z.object({ title: z.string(), symptom: z.string(), cause: z.string(), resolution: z.string(), actor: Actor })),
  agentHandoff: z.object({ agentCan: z.array(z.string()), humanMust: z.array(z.string()), handoffPoints: z.array(z.string()) }),
  confidence: z.object({ difficulty: DConf, timeEstimate: DConf, review: DConf, prerequisites: DConf, steps: DConf,
    redirectUris: DConf, scopes: DConf, blockers: DConf, agentHandoff: DConf }),
});
```
Write the nine `confidence` keys out literally (no `Object.fromEntries`), so the JSON schema has explicit `required` keys.

### 4. MEDIUM: The offline `zodResponseFormat` test doesn't catch strict-mode violations
Where: "Risks: OpenAI Structured Outputs limits" ("`zodResponseFormat` or the API rejects unsupported constructs, so a unit test calls `zodResponseFormat(...)` to catch this offline").
Verified wrong: with openai 4.73.0, `zodResponseFormat(z.object({ x: z.string().optional() }))` and `z.string().url()` both return without throwing. The test as described would pass a schema that the API then rejects at the first real call, turning every live run into `LLM_FAILED`.
Fix: the test walks `zodResponseFormat(GuideDraftSchema,'guide_draft').json_schema.schema` (resolving `$ref`/`definitions`) and asserts:
- Every `type: "object"` node has `additionalProperties: false` and `required` equal to all of its `properties` keys.
- No node contains `format`, `pattern`, `minLength`, `maxLength`, `minItems`, `maxItems`, `minimum`, `maximum`, or `default`.

### 5. MEDIUM: `StreamEvent` TypeScript shape isn't defined, so `emit()` versus `send()` is ambiguous
Where: "SSE protocol" ("the TypeScript union lives in shared/schema.ts as StreamEvent") and `PipelineDeps`/`runPipeline` (`emit: (e: StreamEvent) => void`).
Problem: it's unclear whether the event is `{ event, data }`, `{ type, ...payload }`, or something else. Error-code unions are also split across server-only (`CLIENT_GONE`) and client-only (`NETWORK`, `BAD_RESPONSE`, `STREAM_INTERRUPTED`) codes with no declared types. Frontend and backend will diverge.
Fix: add to `shared/schema.ts`:
```ts
export type ErrorCode = 'INVALID_INPUT'|'INVALID_SLUG'|'NOT_FOUND'|'RATE_LIMITED'|'BUSY'|'CONFIG_MISSING'|'SEARCH_FAILED'|'NO_SOURCES'|'LLM_FAILED'|'TIMEOUT'|'STORE_UNAVAILABLE'|'INTERNAL';
export type ClientErrorCode = ErrorCode | 'NETWORK' | 'BAD_RESPONSE' | 'STREAM_INTERRUPTED';
export type Stage = 'resolve'|'search'|'read'|'draft'|'verify'|'save';
export type StreamEvent =
  | { event: 'meta';   data: { requestId: string; query: string; appName: string; key: string; startedAt: string; force: boolean } }
  | { event: 'step';   data: { id: string; stage: Stage; status: 'active'|'done'|'failed'|'skipped'; label: string; detail?: string; at: string } }
  | { event: 'source'; data: { index: number; url: string; title: string; kind: 'official'|'community' } }
  | { event: 'guide';  data: { guide: Guide; origin: 'curated'|'cache'|'fresh'; cached: boolean; persisted: boolean } }
  | { event: 'error';  data: { code: ErrorCode; message: string; retryable: boolean } }
  | { event: 'done';   data: { ok: boolean; slug: string | null; durationMs: number } };
```
`SseWriter.send<E extends StreamEvent>(e: E)` writes `event: ${e.event}`. `AgentError` gets `code: ErrorCode | 'CLIENT_GONE'` and `retryable: boolean`. The route (not the pipeline) emits `meta` and `done`.

### 6. MEDIUM: Abort and timeout error mapping is unspecified, and the OpenAI SDK doesn't throw `signal.reason`
Where: "Abort semantics" and "Stage 4 failure handling".
Problem: on abort, Node `fetch` rejects with `signal.reason`, but the OpenAI SDK throws `APIUserAbortError`. Its own `timeout: 60000` throws `APIConnectionTimeoutError`. Neither is an `AgentError('TIMEOUT')`. Without a rule, a global timeout during drafting can surface as `LLM_FAILED`, or hit the "retry once" path after the run was already aborted. Generic `APIError`/5xx from OpenAI and non-401/429 Tavily statuses also aren't mapped. AC 11 (TIMEOUT, abort stops calls) depends on this.
Fix: add this rule. In the route's `catch (err)`:
- If `ac.signal.aborted`, the code is `ac.signal.reason.code` (`TIMEOUT` → send `error` with `retryable: true`; `CLIENT_GONE` → write nothing).
- Else if `err instanceof AgentError`, use it.
- Otherwise map to `INTERNAL` (`retryable: true`).

In `llm.ts`:
- Check `signal.aborted` first and rethrow without retrying.
- `APIConnectionTimeoutError`/`APIConnectionError`/`InternalServerError`/generic `APIError` → `AgentError('LLM_FAILED', 'The LLM provider failed to respond', retryable: true)`.
- Never retry the draft after an abort.

Per-call timeouts use `AbortSignal.any([signal, AbortSignal.timeout(ms)])` (Node ≥ 20.3).

### 7. MEDIUM: Concurrency check-then-acquire race, and inline limiter invocation is unspecified
Where: `POST /api/generate` steps 5–7.
Problem: step 5 reads `active >= max`, step 6 awaits the async rate limiter (express-rate-limit v7 awaits `store.increment`), then step 7 acquires. Two concurrent requests can both pass step 5, which exceeds the FR6 global cap. Calling `limiter(req,res,next)` inline also hangs the handler promise when the limiter responds 429 and never calls `next`.
Fix: compose as route middleware and make the slot acquisition atomic:
```ts
router.post('/', express.json({ limit: '2kb' }), validateBody, shortCircuit /* ends response on hit */,
  requireConfig /* 503 CONFIG_MISSING */,
  (req, res, next) => concurrency.tryAcquire() ? (res.locals.slot = true, next()) : busy(res), // sync
  limiter /* handler: concurrency.release(); 429 */,
  asyncHandler(runGeneration) /* finally: concurrency.release() */);
```
`concurrency` exposes `tryAcquire(): boolean`, `release(): void` (idempotent per request via `res.locals.slot`), and `active: number`.

### 8. MEDIUM: Input normalization collapses whitespace before rejecting control characters
Where: "Input normalization", rules 1 and 3.
Problem: rule 1 (trim + collapse whitespace) runs before rule 3 (`\p{Cc}` rejection), so `\t`, `\n`, `\r` (all Cc) are silently turned into spaces and accepted. FR6 says "no control characters". The `input.test.ts` "control chars" case is ambiguous as a result.
Fix: reorder as:
1. Reject if `/\p{Cc}/u.test(raw)`.
2. Trim and collapse `/ {2,}/g` (spaces only).
3. Continue with the remaining rules.

Test cases: `"a\nb"` → 400, `"a\u0000b"` → 400, `"  Asana  "` → ok.

### 9. MEDIUM: Post-processing doesn't define how LLM output is coerced to satisfy `GuideSchema` minimums and optionals
Where: "Stage 6, assemble".
Problem: `clampToSchemaLimits` only truncates. Strict-mode drafts commonly return `""` for required strings (`criticalPath`, `requiredWhen`, `reason`), `[]` for `review.types` (schema requires `.min(1)`), `null` for optionals (schema expects `undefined`), empty source titles (`Source.title` min 1), and invented `app.website` URLs (FR4 only allows retrieved URLs). Each of these fails `GuideSchema.parse`, retries once, then fails with `LLM_FAILED`. That's especially likely on the FR3 "no OAuth" path, which has empty steps, empty types, and so on.
Fix: add a `normalizeDraft` step before the clamp with these rules:
- `null` → `undefined` for every optional field.
- Drop array items whose required strings are empty after trim.
- Empty required string → `"Not stated in the retrieved sources."`.
- `review.types` empty → `review.required ? ['other'] : ['none']`.
- Durations: `min = max(0, min)`, swap if `min > max`.
- Source title empty → the URL's hostname.
- `app.website` follows the same rule as `consoleUrl` (keep only if https and its registrable domain matches a retrieved source, else `undefined`).
- `oauthAvailability.status === 'supported'` with zero steps → set status `'unclear'` and push a note to `verification.uncertain`.

Add a `postprocess.test.ts` case for each rule.

### 10. MEDIUM: `GuideSummary` has no `aliases`, but Library search matches on aliases
Where: the schema's `GuideSummary` type vs `guides.ts` `searchSummaries(list, …)` ("matches name, category, aliases and review types").
Problem: this is an internal type inconsistency. Either it's a TS error or alias search (e.g. "gmail" → Google Workspace) silently doesn't work.
Fix:
```ts
export type GuideSummary = Pick<Guide,'slug'|'aliases'|'app'|'difficulty'|'generatedBy'|'generatedAt'> & { … };
```
`toSummary` copies `aliases`. Add a `Library.test.tsx` case where searching "gmail" shows Google Workspace.

### 11. MEDIUM: The UI-section to confidence-key mapping is unspecified (AC 17)
Where: "GuideView" ("Each section heading has a ConfidenceTag built from guide.confidence[section]").
Problem: the UI sections (Header, Summary/OAuth banner, TimeEstimate, ApprovalTimeline, Prerequisites, StepList, ScopesPanel, Blockers, AgentHandoff, Sources) don't map 1:1 to `SECTION_KEYS`. Summary and Sources have no key, and ScopesPanel covers both `scopes` and `redirectUris`. AC 17 requires "each with a confidence tag".
Fix: add this table to the design.

| UI section | Confidence key |
|---|---|
| GuideHeader difficulty | `difficulty` |
| TimeEstimate | `timeEstimate` |
| ApprovalTimeline | `review` |
| Prerequisites | `prerequisites` |
| StepList | `steps` |
| ScopesPanel / Scopes sub-heading | `scopes` |
| ScopesPanel / Redirect URIs sub-heading | `redirectUris` |
| BlockersAccordion | `blockers` |
| AgentHandoff | `agentHandoff` |

Summary and SourcesPanel carry no ConfidenceTag; Sources shows "Last verified {date}" instead. The test asserts nine tags.

### 12. MEDIUM: Client handling of pre-stream errors and the "live generation unavailable" state is unspecified
Where: "stream.ts" (throws `ApiError { status, code, message, retryAfterSec }`) and "Generate" error panel ("per-code title", "Try again when retryable").
Problem: `ApiError` carries no `retryable`, and per-code titles aren't defined. For A1 and FR7 (keys missing), the only UX is an error after submit. There's no rule for whether the form stays usable for curated and cache hits, which do work without keys.
Fix: add a mapping in `src/lib/errors.ts`.

| Code | Title | Retryable |
|---|---|---|
| `CONFIG_MISSING` | "Live generation unavailable" | false |
| `BUSY` | "The agent is busy" | true, after `retryAfterSec` |
| `RATE_LIMITED` | "Hourly limit reached" | "Try again in {n} min" |
| `INVALID_INPUT` | "Check your input" | false |
| `NETWORK` | "Can't reach the agent server" | true |
| `NO_SOURCES` | "No developer docs found" | false |
| `SEARCH_FAILED` / `LLM_FAILED` / `TIMEOUT` / `INTERNAL` / `STREAM_INTERRUPTED` / `BAD_RESPONSE` | "Generation failed" | per the event's flag, else true |

The Generate page also calls `GET /api/health` on mount, with no blocking and errors ignored. If `llmConfigured && searchConfigured` is false, it shows an info banner: "Live research isn't configured on this server. Curated guides still load." The form stays enabled, because curated and cache hits still succeed.

### 13. MEDIUM: PDF "required section id" post-check can't work as written, because `marked` 15 emits no heading ids
Where: "build-pdf.mjs" step 8 ("The HTML contains each required section id").
Verified: `marked.parse('# Problem understanding')` → `<h1>Problem understanding</h1>` (no `id`). The ids to check are never listed.
Fix: `build-pdf.mjs` wraps each content file as `<section id="sec-${stem}">…</section>`, plus `<section id="sec-title">` for the title page, and checks this exact list:
```js
const REQUIRED = ['sec-title','sec-01-problem','sec-02-scope','sec-03-how-it-works','sec-04-guide-format','sec-05-samples',
  'sec-06-live-agent','sec-07-use-of-agents','sec-08-evidence-log','sec-09-limitations','sec-10-future','sec-11-screenshots'];
```
Fix the content filenames to those stems. The layout currently says `01-problem.md … 10-future.md`, which conflicts with the 11-section list.

### 14. NIT: The Figma `review.required` value isn't defined
Where: "Curated guide content plan", Figma row ("uncertain → mark `uncertain`"). The schema field is a boolean.
Fix: `review.required: false`, `requiredWhen: "Unconfirmed: Figma may review public/community-published integrations"`, `types: ['other']`, `confidence.review.level: 'uncertain'`, and an entry in `verification.uncertain`.

### 15. NIT: `source` event `index` and `read-{i}` numbering are ambiguous
Fix: `index` is the 0-based position in the run's candidate list (pre-reindex). It's display-only and isn't a `sourceRefs` index. `read-{i}` uses the same 0-based `i`.

### 16. NIT: `slugify` isn't defined and no dependency is listed
Fix: write `slugify(s)` in `postprocess.ts`: NFKD → lowercase → replace `/[^a-z0-9]+/g` with `-` → trim `-`, falling back to `'app'` when empty.

### 17. NIT: Cold-start notice text differs from AC 20
Fix: use the exact string "Waking up the agent server…" on both Generate and GuideDetail, optionally followed by " Free hosting can take up to a minute." Define first byte as the moment `fetch` resolves (headers received).

### 18. NIT: `chunkSizeWarningLimit: 900` is below the measured size
Verified: the probe with three, R3F, and drei components built to about 1.1 MB min (308 KB gzip) including react-dom, so the lazy three chunk will exceed 900 KB and warn.
Fix: set `chunkSizeWarningLimit: 1200`, or accept the warning. Update the "about 700 KB" estimate.

### 19. NIT: Transitive extras from drei 9.117.3
The lockfile nests `three@0.170.0` under `stats-gl`, and `three-mesh-bvh@0.7.8` is deprecated. Neither is bundled unless `StatsGl`/`Bvh` are imported.
Fix: add a note: "Do not import drei `StatsGl`, `Bvh`, or `PerformanceMonitor`-adjacent stats components." Optionally add `"overrides": { "stats-gl": { "three": "0.169.0" } }`.

### 20. NIT: `ALLOWED_ORIGINS` set to an empty string isn't handled
Render `sync: false` lets you save it blank. zod's `.default` only applies to `undefined`, so an empty string yields an empty allow-list and the Vercel UI gets CORS-blocked.
Fix: treat `""` as unset (use the defaults). At boot, when `NODE_ENV=production` and every allowed origin is `localhost`, log `warn` "ALLOWED_ORIGINS has no production origin".

### 21. NIT: `TRUST_PROXY=1` on Render is unverified
If it's wrong, every user shares one rate-limit bucket.
Fix: log `req.ip` and the XFF hop count at `debug` on generate. The README tells the deployer to confirm `req.ip` varies per client, and to adjust `TRUST_PROXY` if it doesn't.

### 22. NIT: `capture-screenshots.mjs` assumes a running preview server
Fix: before capture, `fetch(BASE_URL)`. On failure, exit 1 with "Start `npm --prefix frontend run build && npm --prefix frontend run preview` first."

### 23. NIT: `IsoDate` regex accepts impossible dates (`2026-13-45`)
Fix: `.refine(s => !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().startsWith(s))`.

### 24. NIT: GuideDetail treats an API 400 (`INVALID_SLUG`) as a generic error with Retry
Fix: render 400 the same as 404 ("Guide not found"). Optionally, validate the slug client-side with the same regex before fetching.

### 25. NIT: Store re-validation ownership is stated twice and inconsistently
One sentence says "Every get re-validates"; another says "The guide-detail route enforces this".
Fix: state once: "Every `GuideStore.get` implementation returns `GuideSchema.safeParse(...).success ? data : null` (log `warn` on failure). Routes trust store output."

## Verified Assumptions

- All pinned versions exist. The frontend, backend, and submission sets each resolve with `npm install --package-lock-only` (exit 0, no ERESOLVE), with a single `react@18.3.1`/`react-dom@18.3.1` and top-level `three@0.169.0`.
- `@react-three/drei@9.117.3` peers are `react >=18.0`, `react-dom >=18.0`, `three >=0.137`, `@react-three/fiber >=8.0`. `@react-three/fiber@8.17.10` peers are `react >=18.0`, `three >=0.133` (expo/react-native peers are optional). R3F 8 + drei 9 + React 18 + three 0.169 is compatible.
- A probe using every drei/R3F API the design names type-checks (with `skipLibCheck: true`) and `vite build`s successfully. The APIs covered were `Float`, `RoundedBox`, `Line` with `dashed`/`dashOffset`, `Sparkles`, `Environment resolution` with `Lightformer` children, `meshPhysicalMaterial` transmission props, `frameloop='never'`, and `dpr={[1,1.75]}`.
- `eventsource-parser@3.0.0` `createParser({ onEvent })` exists, with `e.event`/`e.data`.
- `openai@4.73.0` peers `zod ^3.23.8`, exports `openai/helpers/zod` `zodResponseFormat`, and has `client.beta.chat.completions.parse`.
- `@testing-library/react@16.0.1` peers `@testing-library/dom ^10`. `@vitejs/plugin-react@4.3.4` accepts vite 5. `vitest@2.1.5` works with jsdom/@types/node 22. `lucide-react@0.460.0` and `framer-motion@11.11.17` accept React 18.
- `express-rate-limit@7.4.1` exports `rateLimit` (and default), Node ≥ 16. `puppeteer@23.9.0` needs Node ≥ 18, and Node 22.21.0 is installed.
- The workspace currently contains only `.gitignore`, `.agents/`, and an empty `submission/`, as the design states.
- The Windows PDF pipeline is runnable in principle:
  - npm scripts use no bash syntax (`npm --prefix`, `node ../scripts/...`).
  - Paths go through `path.join`/`fileURLToPath`.
  - There's a Chrome/Edge executable fallback and an EBUSY retry.
- Vercel SPA rewrite (`/(.*)` → `/index.html`) plus filesystem-first precedence covers AC 15. CORS echo/omit behavior via the `cors` origin callback matches AC 10.
- The missing-keys path is correct server-side: the curated/cache short-circuit runs before the `CONFIG_MISSING` check (AC 7, A1), and health reports `llmConfigured`/`searchConfigured`.

## Unverified / Wrong Assumptions

- Wrong: "`zodResponseFormat` … rejects unsupported constructs, so a unit test … catches this offline." `.optional()` and `.url()` both pass `zodResponseFormat` without error (Finding 4).
- Wrong: the generated `import … from './schema'` compiles in the backend. NodeNext requires `.js` (Finding 1).
- Wrong: "the HTML contains each required section id". `marked` 15 emits no heading ids (Finding 13).
- Wrong in effect: the implicit frontend tsconfig. With TS 5.6.3, `skipLibCheck` must be `true` because of the `hls.js` types pulled in by drei (Finding 2).
- Wrong in effect: the "lazy three chunk is about 700 KB min" estimate. The measured probe is about 1.1 MB min including react-dom (Finding 18).
- Unverified (no network docs access in review):
  - Vercel "Include source files outside of the Root Directory" defaults to ON.
  - Render's proxy hop count for `TRUST_PROXY=1`.
  - Current OpenAI Structured Outputs size and nesting limits for a draft schema with about 110 properties and 5 nesting levels. Older docs stated 100 properties and 5 levels; the current limits are believed higher. Confirm on the first keyed run.
  - Tavily response field names (`raw_content`, `failed_results`) and the 432/433 quota codes.
  - The candidate official doc URLs. The design already gates these behind `check-links`.
