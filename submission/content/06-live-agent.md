# Live agent flow

When a reviewer types an app name the library doesn't already cover and clicks **Generate**, the browser opens a streaming `POST /api/generate` request and renders progress from Server-Sent Events in an `aria-live` activity timeline.

## What the reviewer sees

A sequence of step events, using the labels the pipeline emits:

1. *Resolving Asana…*
2. *Searching docs…* (three Tavily queries in parallel)
3. *Reading &lt;page title&gt;…* (one step per page read; source events stream in alongside)
4. *Drafting guide…* (the draft is assembled and schema-validated inside this step, with at most one repair attempt)
5. *Verifying claims…*
6. *Saving shareable guide…*, which ends as *Saved shareable guide*, then the finished guide renders in place.

Streaming the steps is deliberate: a 30–90 second wait reads as the agent working, not as a hung page.

## Short-circuits and guards

- **Curated or cached hit** resolves in the first stage and returns immediately, flagged `cached`. These do **not** count against the rate limit.
- **No keys configured** → a `503` JSON response with code `CONFIG_MISSING`, sent before any stream opens. The UI shows a clear message instead of a blank screen, and the curated library keeps working.
- **Rate limit** → `429` with a `Retry-After` so a reviewer (or a bot) can't run up the API bill.
- **Concurrency cap** → `503 BUSY` when too many generations run at once.
- **Timeout** → the run aborts after `GENERATION_TIMEOUT_MS` (code default 120 seconds; the Render blueprint sets 180 seconds) with a `TIMEOUT` error event.
- **Client disconnect** → the server detects the closed response and stops the pipeline (`CLIENT_GONE`), so an abandoned run doesn't keep spending.

## Determinism after the model

The LLM only ever produces a *draft*. Everything that makes a guide trustworthy happens in deterministic post-processing afterward: console URLs are allow-listed to the app's own domains, confidence is capped at the verifier's judgment, foreign or invented URLs are dropped, and the result must pass the same `GuideSchema` the curated guides pass — or the run fails loudly rather than shipping a malformed guide.
