# Future work

- **Scheduled re-verification.** Run the link checker on a schedule and flag guides whose sources moved or broke, so `lastVerified` stays honest without manual sweeps.
- **Diff-aware updates.** Detect when an official page's content changes (not just its URL) and re-run the relevant section through the agent.
- **Expand curated coverage.** Promote the most-generated live apps into the curated, hand-verified set.
- **Scope advisor.** Given the feature a developer wants, recommend the narrowest scope set and warn when a requested scope triggers a heavier review path (e.g. Google restricted scopes → CASA).
- **Agent-executable handoffs.** For the steps already tagged "agent can do," emit copy-paste-ready snippets (callback route, token exchange) tailored to the user's stack.
- **Durable links by default.** Ship with Upstash wired so every live-generated guide has a permanent shareable URL out of the box.
- **Webhook/notification integration.** Let a user subscribe to a guide and get notified when its verification status changes.
