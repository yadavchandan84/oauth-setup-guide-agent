# Guide format

Every guide — curated or live — is the same validated structure. That uniformity is what makes apps comparable and makes the live agent's output trustworthy: it has to fill the same slots the curated guides do.

## Sections

- **App + brand** — name, category, website, a monogram and brand color (no hot-linked logos).
- **OAuth availability** — supported / not-supported / unclear, with alternatives.
- **Difficulty** — `Easy` · `Moderate` · `Hard` · `Very Hard`, with a one-line reason.
- **Time estimate** — hands-on effort and approval wait as `{min, max, unit}` ranges, plus the critical path.
- **Review** — whether approval is required, when, which review types apply, and the ordered stages that drive the approval timeline.
- **Prerequisites** — what must exist before you start, each tagged with an actor.
- **Steps** — ordered actions with detail, an optional console URL, an actor, an estimate, and a gotcha.
- **Redirect URIs** — notes and example callback URLs.
- **Scopes** — recommended scopes with purpose, plus sensitive/restricted scopes and their consequences.
- **Blockers** — common failure → symptom → cause → resolution.
- **Agent handoff** — what the agent can do, what a human must do, and the handoff points.

## Actors

Every step, prerequisite, and blocker carries an **actor** so the agent/human split is explicit:

- **Agent can do** — automatable (writing the callback route, implementing the token exchange).
- **You must do** — requires a human (signing in, generating a secret, submitting for review).
- **Agent can assist** — a human decision the agent can draft or prepare.

## Confidence and evidence

Each of the nine content sections carries a **confidence level** and source references:

- **verified** — backed by an official source URL that passed the link checker.
- **community** — reported by forums/blogs or widely-known, but not stated on an official page (typical for approval-wait figures).
- **uncertain** — confirm before relying on it.

Confidence is never inflated: the live agent's post-processing caps a section's confidence at the verifier's judgment, and a section can only be `verified` when an official source actually supports it.
