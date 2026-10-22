# Design Review (round 3): OAuth App Approval Guide Agent

Reviewed: `.agents/tasks/design.md` (revision 3) against `.agents/tasks/requirements.md`.

Verdict: **CHANGES_REQUESTED** (0 HIGH, 3 MEDIUM, 12 NIT)

Revision 3 closes all 15 round-2 findings. The areas this review was asked to focus on mostly hold:

- The dependency set is exact-pinned and compatible.
- The SSE protocol is typed once and unambiguous.
- The store interface covers every caller.
- Vercel rewrites and CORS are specified.
- The missing-keys fallback works end to end.

Three gaps would still misdirect implementation:

- The PDF build mangles inline SVG/HTML. I reproduced this with marked 15.0.2.
- `normalizeDraft` lets empty optional strings and verifier output through, and `GuideSchema` rejects them. I reproduced this with zod 3.23.8.
- The repair-retry flow is described two incompatible ways.

## How assumptions were checked

- Ran `npm view <pkg>@<ver> version peerDependencies` for 23 pinned packages: drei, fiber, three, @types/three, eventsource-parser, openai, express-rate-limit, @upstash/redis, puppeteer, marked, vitest, plugin-react, @testing-library/react, tailwindcss, helmet, nanoid, tsx, supertest, both fontsource packages, framer-motion, lucide-react and react-router-dom.
- Installed `marked@15.0.2`, `zod@3.23.8`, `vitest@2.1.5`, `jsdom@25.0.1` and `eventsource-parser@3.0.0` in a throwaway temp folder, then ran these probes:
  - The PDF pipeline's "replace `{{KEY}}` then `marked.parse`" order, with a realistic indented SVG and table.
  - The design's `Str(n).optional()` against `""` and `"  "`.
  - A vitest jsdom-environment test that streams `new Response(ReadableStream)` through `TextDecoderStream` into `createParser`, with chunks split mid-field, a `: ping` comment and `id:` lines.
- Read the current `.gitignore`. Checked the PowerShell version (5.1.26100), Node v22.21.0, npm 10.9.4 and the system date (2026-10-20).
- Deleted the temp folder afterwards.
- I relied on round 2 for the full frontend install/tsc/vite-build probe and the backend NodeNext compile of `shared/schema.ts` and `draftSchema.ts`. Neither pin set nor those code blocks changed in revision 3.

## Findings

### 1. MEDIUM: The PDF pipeline replaces block tokens before `marked`, which turns inline SVG and HTML into escaped code blocks
Where: "Submission PDF pipeline", step 2: "Replace `{{KEY}}` tokens from config and render with `marked`". Step 3 then fills `ARCHITECTURE_SVG`, `SAMPLE_GUIDES`, `LINK_CHECK_TABLE` and `SCREENSHOTS` through the same token mechanism.
Problem: verified with marked 15.0.2. CommonMark ends a raw-HTML block at the first blank line. After that, any line indented by 4 or more spaces becomes `<pre><code>` with the markup escaped. A hand-authored `architecture.svg`, or a generated sample table with a blank line and nested indentation, came out as:
```html
<svg …>
  <g>
    <rect …/>
<pre><code>&lt;text x=&quot;1&quot; y=&quot;1&quot;&gt;Browser&lt;/text&gt;
</code></pre>
```
The post-check ("an `<svg` inside `sec-03-how-it-works`") still passes, so the corruption reaches the submitted PDF unnoticed. Placeholders left in the markdown and rendered by marked come out as a clean `<p>{{ARCHITECTURE_SVG}}</p>`.
Fix: split the tokens into two kinds and replace them in two phases.
```js
const INLINE = ['VERCEL_URL','RENDER_URL','REPO_URL','CANDIDATE_EMAIL','SUBMISSION_DATE']; // plain strings
const BLOCK  = { ARCHITECTURE_SVG, SAMPLE_GUIDES, LINK_CHECK_TABLE, SCREENSHOTS };        // HTML strings
let md = fs.readFileSync(file, 'utf8');
for (const k of INLINE) md = md.replaceAll(`{{${k}}}`, escapeHtml(cfg[k]));             // phase 1: before marked
let html = marked.parse(md);
for (const [k, v] of Object.entries(BLOCK)) {                                              // phase 2: after marked
  html = html.replaceAll(`<p>{{${k}}}</p>`, v).replaceAll(`{{${k}}}`, v);
}
if (/\{\{[A-Z_]+\}\}/.test(html)) fail(`unreplaced token in ${file}`);
```
Rules:
- Block tokens must sit alone on their own line in the `.md` files.
- Add post-checks that exit 1:
  - The HTML contains no `<pre><code>&lt;svg`, `&lt;table` or `&lt;figure`.
  - `sec-03-how-it-works` contains `</svg>`.

### 2. MEDIUM: `normalizeDraft` doesn't handle empty optional strings, verifier output is never normalized, and the source of each confidence `note` is unspecified
Where: "Stage 6, assemble", `normalizeDraft` rules 1–3, and the confidence and verification bullets after them.
Problems:
- **Empty optional strings.** Rule 1 maps only `null` → `undefined`. Verified with zod 3.23.8: `Str(300).optional()` rejects both `""` and `"  "`. LLMs in strict mode often emit `""` instead of `null` for `gotcha`, `estimate`, `note`, `detail` and `DurationRange.note`. Each one fails `GuideSchema`, uses up the single repair retry, and can end the run as `LLM_FAILED`.
- **Verifier output.** `VerificationSchema` output feeds `confidence[k].note` (`Str(300).optional()`) and `verification.checked/corrected/uncertain` (`Str(300)` items). No rule trims these or drops empty values, so an empty verifier note or array item also fails `GuideSchema`. Because this failure comes after verify, it falls into the ambiguous retry path in Finding 3.
- **Which note.** `confidence[k] = { level: min(draft, verifier), note, … }` doesn't say whether `note` comes from the draft or the verifier.
- **Cap ordering.** The pipeline-authored notes ("Automated verification pass did not complete…", "The agent found no concrete setup steps…") are pushed onto `verification.uncertain`, and the list is then capped at 15. If 15 verifier items come first, the cap can drop the note AC 11 requires.

Fix: replace rule 1 and add a verifier rule.
- **Rule 1.** For every field that is `.optional()` in `GuideSchema`, a `null` value, or a string that is empty after trimming, becomes `undefined`. `steps[].consoleUrl` keeps `null` for `null` or `""`.
- **Rule 9, `normalizeVerification(v)`.** Trim every string. Drop empty items from `checked`, `corrected` and `uncertain`. An empty `sections[k].note` becomes `undefined`.
- **Note selection.** `confidence[k].note` is the verifier's note when the verifier's level is strictly lower than the draft's. Otherwise it's the draft's note. Truncate to 300.
- **Cap ordering.** Pipeline-authored notes are inserted at the front of `verification.uncertain` before the cap: `uncertain = [...pipelineNotes, ...verifierUncertain].slice(0, 15)`.
- **Tests** in `postprocess.test.ts`:
  - `gotcha: ""` → field absent, and the guide is valid.
  - A verifier note of `""` → absent.
  - Verifier `checked: ["", "x"]` → `["x"]`.
  - 15 verifier uncertain items plus a verifier failure → the pipeline note is at index 0.

### 3. MEDIUM: The repair-retry flow contradicts itself between Stage 4 and Stage 6
Where:
- "Stage 4, draft": "an assembled guide that fails `GuideSchema` after `normalizeDraft` triggers one repair retry".
- "Stage 6, assemble": "Finally `GuideSchema.parse`. Failure here triggers the stage-4 retry path (draft again with the issues), at most once overall."
- The error table row "assemble | schema invalid after retry".

Problem: Stage 6 runs after Stage 5 (verify). Two readings are both valid:
- (a) Validate right after the draft, before verify.
- (b) Run draft → verify → assemble, and on failure go back to draft, which raises the question of whether verify runs again.

Reading (b) also leaves open the UI behaviour: `draft` and `verify` steps already marked `done` would have to be re-opened. Neither the step events nor the `pipeline.test.ts` "Draft invalid then valid (retry)" expectations are pinned down, so two implementers would build different pipelines and tests.
Fix: choose (a) and state it.
```ts
// pipeline.ts, stage 4
let draft: GuideDraft | null = null; let issues: string[] | null = null;
for (let attempt = 0; attempt < 2; attempt++) {
  signal.throwIfAborted();
  if (attempt === 1) emit({ event: 'step', data: { id: 'draft', stage: 'draft', status: 'active',
    label: 'Drafting guide…', detail: `Fixing ${issues!.length} formatting issue(s)`, at: iso() } });
  try {
    const d = await deps.draft({ input, sources, repairIssues: issues }, signal);
    assembleGuide({ draft: d, verification: null, sources, input, now, model, randomSuffix }); // validation probe
    draft = d; break;
  } catch (err) {
    if (signal.aborted) throw signal.reason;
    if (err instanceof DraftInvalid) issues = err.issues;
    else if (err instanceof z.ZodError) issues = err.issues.slice(0, 10).map(i => `${i.path.join('.')}: ${i.message}`);
    else throw err;                                   // provider errors: already AgentError, not repaired
  }
}
if (!draft) throw new AgentError('LLM_FAILED', "The agent couldn't produce a valid guide", true);
// stage 5 verify (once), stage 6 final assemble with the normalized verification.
// A final-assemble ZodError is a bug: log error, throw LLM_FAILED (retryable true), no second repair.
```
Notes:
- `DraftInvalid` must be exported from `llm.ts`, or `draft()` should rethrow it as a pipeline-visible type. The design currently calls it "module-private" while also saying "the pipeline catches it by `instanceof`", and both can't be true.
- Pipeline tests then assert two things:
  - Exactly one `verify` call per run.
  - The repair attempt re-sends `step draft active` with a `detail`.

### 4. NIT: README local-dev commands don't run in the user's shell
Where: "README.md covers … Local dev (`cd backend && npm i && npm run dev`, …)".
Problem: this machine runs Windows PowerShell 5.1.26100, where `&&` is a parse error. NFR6 only covers npm scripts, but the README is what the user will actually paste.
Fix: document the commands in a shell-neutral form:
- `npm --prefix backend install`, then `npm --prefix backend run dev`.
- Same for `frontend` (`npm --prefix frontend install`, then `npm --prefix frontend run dev`).
- Each command goes on its own line.

### 5. NIT: The `/\bloom\b/i` post-check runs over base64 image data
Where: build-pdf step 8.
Problem: `SCREENSHOTS` inlines several MB of base64. A `+loom/`-style sequence there matches `\b`, which would fail a good build at random.
Fix: run the check on `html.replace(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+/g, '')`.

### 6. NIT: `streamGenerate` has no timeout for headers
Where: `stream.ts`. `getJson` has `timeoutMs = 70000`, but `streamGenerate` has none, so a hung TCP connect to a dead Render instance can spin forever behind the cold-start notice (AC 21 wants a clear error).
Fix: add `headersTimeoutMs = 90_000`. If `fetch` hasn't resolved by then, abort with an internal reason and throw `ApiError('NETWORK', 'The server took too long to respond.')`. Clear the timer on first byte. A user Cancel still maps to `cancelled`, not `NETWORK`.

### 7. NIT: Client behaviour after a terminal event isn't specified
Where: `stream.ts`, rules 4–5.
Fix:
- After the first `error`, whether received or synthesized (e.g. `BAD_RESPONSE`), ignore all further events.
- If a valid `guide` was received and the stream then ends without `done`, treat the run as complete instead of emitting `STREAM_INTERRUPTED`.

### 8. NIT: API responses read by the frontend aren't validated, and store `listRecent` output is never re-validated
Where:
- GuideDetail fetches `GET /api/guides/:slug` via `getJson`, and only the SSE `guide` is `safeParse`d.
- "Invariant ownership" covers `get` only. `listRecent` returns disk or Redis data unchecked.

Fix:
- GuideDetail runs `GuideSchema.safeParse` on the response, and failure goes to `BAD_RESPONSE`.
- `GET /api/guides` filters `recent` with a zod `GuideSummarySchema`, built as `z.object({ slug, aliases, app, difficulty, generatedBy, generatedAt, reviewRequired, reviewTypes, handsOn, approvalWait })` from the existing pieces. Invalid entries are dropped with a `warn` log.

### 9. NIT: Two boot-time behaviours are unspecified
Fix:
- `STORE=upstash` with no Upstash credentials is fatal at boot ("STORE=upstash requires UPSTASH_REDIS_REST_URL and _TOKEN"), the same as one credential alone.
- When `!llmConfigured || !searchConfigured`, `server.ts` still builds `PipelineDeps`, using `draft`/`verify`/`search`/`extract` stubs that throw `AgentError('CONFIG_MISSING', …)`. `requireConfig` makes them unreachable in practice, and the types stay total.

### 10. NIT: Error messages for URL-rule failures are missing
Where: input rule 4. Rules 1, 3 and 5 give messages, but rule 4 doesn't for: more than 200 chars, a bad protocol after parsing, no dot, an IP literal, `localhost`, or a `new URL()` throw.
Fix: use one message for all of them: "Enter a public app name or developer docs URL (max 200 characters)." Rule 6 (empty key) reuses rule 5's message.

### 11. NIT: Local screenshot capture shows the Generate form disabled
Where: `capture-screenshots.mjs`, which defaults to `vite preview` of a production build. Without `VITE_API_URL` at build time, `apiConfigured` is false, so `07-generate-idle.jpg` shows "Live generation isn't configured for this deployment."
Fix: the pre-flight message and the README say to build with the API URL set. In PowerShell that's `$env:VITE_API_URL='http://localhost:8787'; npm --prefix frontend run build`. Otherwise, capture against the deployed Vercel URL with `BASE_URL`.

### 12. NIT: Small UI and protocol labels are unspecified
- The cache-hit short-circuit `step` label isn't given. Use `"Found a guide generated {relative time}"`, with id `resolve`, stage `resolve`, status `done`.
- The hint "Uses 1 of your 5 hourly live generations" hardcodes 5, but `RATE_LIMIT_MAX` is configurable. Add `rateLimitMax: number` to the `/api/health` body and render it, falling back to the plain text "Uses 1 live generation" when health is unavailable.

### 13. NIT: The `deployFiles.test.ts` path is described inaccurately
Where: it "reads `backend/.env.example` and `../render.yaml` relative to the test file". From `backend/test/`, the paths are `../.env.example` and `../../render.yaml`.
Fix: write them as `path.resolve(here, '..', '.env.example')` and `path.resolve(here, '..', '..', 'render.yaml')`.

### 14. NIT: The frontend `vitest.config.ts` omits the React plugin
Where: "`frontend/vitest.config.ts` sets `environment: 'jsdom'`, `globals: true` … `setupFiles`". A standalone `vitest.config.ts` doesn't load `vite.config.ts`. JSX then depends on Vite's esbuild picking up `jsx: react-jsx` from the tsconfig.
Fix: `export default defineConfig({ plugins: [react()], test: { environment: 'jsdom', globals: true, setupFiles: ['src/test/setup.ts'] } })`, with `defineConfig` imported from `vitest/config`.

### 15. NIT: Alias rule misses common phrasings, so curated apps can trigger paid live runs
Where: the alias examples. "Microsoft Entra ID" gives key `microsoftentraid`, which matches neither the slug key, the normalized name (`microsoftentraidgraph`) nor any alias. Same for "Atlassian Jira" (`atlassianjira`), "Stripe Connect" in combination forms, and "Salesforce Connected App" (`salesforceconnectedapp`, unless the name normalizes exactly).
Fix: add an authoring rule: aliases must include the normalized key of each common phrasing of the provider name, e.g. `microsoftentraid`, `entraid`, `atlassianjira`, `jiracloud`, `googlegmail`. `curated.test.ts` should also assert that these phrasings resolve via `curated.match`: "Microsoft Entra ID", "Azure AD", "Gmail", "Jira", "Stripe" and "G Suite".

## Verified Assumptions

- Every pinned version I queried exists on npm. The peer ranges are compatible:
  - drei 9.117.3 needs `react >=18`, `react-dom >=18`, `three >=0.137` and `@react-three/fiber >=8`.
  - fiber 8.17.10 needs `react >=18` and `three >=0.133`. Its expo/RN peers are optional.
  - openai 4.73.0 needs `zod ^3.23.8`, and 3.23.8 is pinned.
  - express-rate-limit 7.4.1 needs express 4 or 5.
  - @testing-library/react 16.0.1 needs react 18, @types/react 18 and @testing-library/dom ^10, all pinned.
  - @vitejs/plugin-react 4.3.4 accepts vite 5.
  - vitest 2.1.5 accepts jsdom 25 and @types/node 22.
  - framer-motion 11.11.17 and lucide-react 0.460.0 accept React 18.
  - React 18.3.1, R3F 8.17.10, drei 9.117.3, three 0.169.0 and @types/three 0.169.0 are a known-compatible set (the R3F v8 / drei v9 / React 18 line). All are exact pins. `save-exact` and committed lockfiles are specified.
- The frontend stream approach works under the vitest jsdom environment: a `Response` wrapping a `ReadableStream`, piped through `TextDecoderStream`, into `eventsource-parser` 3.0.0 `createParser({ onEvent })`. It handles events split mid-field, `: ping` comments and `id:` lines, and yields exactly the expected events.
- The guide schema is internally consistent:
  - `SECTION_KEYS` matches the literal `confidence` keys in `GuideSchema`, `GuideDraftSchema` and `VerificationSchema`.
  - The UI confidence-tag table maps exactly one tag per key (AC 17).
  - `superRefine` checks the `sourceRefs` range and the supported-means-at-least-one-step rule. `normalizeDraft` rule 7 keeps live output consistent with it.
  - `verification.sources` stays non-empty for live guides, because zero results throw `NO_SOURCES` first and the read pages are always kept.
  - `Guide.query` ≤200 is guaranteed by `AppInput.raw`'s definition.
- The SSE protocol is unambiguous:
  - Six event names, each with a typed payload, form one `StreamEvent` union in `shared/schema.ts`.
  - Ownership: the route emits `meta`/`done`/`error`, and the pipeline emits `step`/`source`/`guide`.
  - Clients upsert steps by `id`. `source.index` equals `read-{i}`, and both are display-only.
  - Codes synthesized by the client are a separate `ClientErrorCode`, and `CLIENT_GONE` is kept off the wire by type.
- The store interface (`kind`, `get`, `put`, `listRecent`, `getCache`, `setCache`) covers every caller: guide routes, the short-circuit path, pipeline save, and AC 13 caching. `persisted` semantics are defined precisely.
- Missing-keys fallback:
  - The curated and cache short-circuit runs before `requireConfig`.
  - A fresh request returns 503 `CONFIG_MISSING` JSON (AC 7).
  - Health reports `llmConfigured`/`searchConfigured` (AC 4).
  - The Generate page shows a non-blocking banner and the form stays enabled (AC 20a).
  - `describeError` gives "Live generation unavailable" with no retry.
- Rate-limit ordering: shortCircuit → requireConfig → acquireSlot → limiter. Only fresh, configured, slot-holding requests consume quota (FR6, AC 9). The slot is released exactly once on every path.
- CORS: the exact-match origin callback omits ACAO for disallowed origins and allows requests with no `Origin`. Blank `ALLOWED_ORIGINS` falls back to the localhost defaults, and there's a production warning (AC 10, FR8). Pre-stream JSON errors also get CORS headers, because cors runs before the routes.
- Vercel: the `/(.*)` → `/index.html` rewrite with filesystem precedence covers deep links (AC 15). `vite preview` falls back to the SPA by default. The `prebuild` sync reads `../shared` and fails loudly with a fix hint if it's missing.
- Render: the `render.yaml` build/start/health strings match AC 23 verbatim. Env parity between `.env.example`, `render.yaml` and `CONFIG_KEYS` is unit-tested, and `CONFIG_KEYS` lists 17 keys, matching the config table.
- The PDF pipeline is otherwise Windows-runnable:
  - It's ESM `.mjs`.
  - Every path is script-relative.
  - There's no shell syntax in npm scripts. `npm --prefix` works from the repo root under cmd.exe.
  - There's a puppeteer Chrome/Edge fallback and an EBUSY retry for OneDrive.
  - The footer template is concrete.
- The `.gitignore` description in the design matches the actual file: it ignores `.env`, `.env.local`, `.env.*.local` and `!.env.example`, and revision 3 replaces those with `.env*` and `!.env.example`.
- Local toolchain: Node v22.21.0, npm 10.9.4, system date 2026-10-20.

## Unverified / Wrong Assumptions

- Wrong:
  - That rendering `{{ARCHITECTURE_SVG}}`/`{{SAMPLE_GUIDES}}` before `marked` keeps the HTML intact. It doesn't once the HTML contains a blank line plus indentation (Finding 1).
  - That `normalizeDraft` yields schema-valid output for normal LLM responses. `""` in optional fields and in verifier notes or arrays fails `GuideSchema` (Finding 2).
  - That `DraftInvalid` can be both module-private to `llm.ts` and caught by `instanceof` in `pipeline.ts` (Finding 3).
  - That the README's `&&` commands work in the user's shell, Windows PowerShell 5.1 (Finding 4).
- Unverified, carried forward. Each has a documented mitigation and surfaces on the first keyed run or deploy:
  - The OpenAI API accepts the `nullable: true` form that `zodResponseFormat` 4.73.0 emits. The Structured Outputs size and nesting limits hold for the roughly 110-property draft schema.
  - Tavily `Authorization: Bearer` auth, the `raw_content`/`failed_results` field names, and the 432/433 quota codes.
  - Vercel's "include files outside the root directory" default.
  - Render's proxy hop count for `TRUST_PROXY=1`, and whether Render's edge buffers SSE.
- Not re-run this round: the full frontend `tsc` + `vite build` probe and the backend NodeNext compile of the schema blocks. Round 2 verified both, and neither the pins nor those code blocks changed in revision 3.
