# Limitations

- **Approval timelines are estimates.** Most providers don't publish review SLAs, so wait-time figures are community-reported ranges, marked as such. Treat them as planning aids, not guarantees.
- **Docs drift.** OAuth consoles and documentation move and get renamed often (several already did during research — see the evidence log). A guide is a snapshot as of its `lastVerified` date; the link checker catches dead URLs but not silent content changes.
- **Live generation depends on third parties.** A live run needs Tavily and OpenAI reachable and keyed. Without keys the endpoint returns a clean `503`, and the curated library still works — but the live feature itself is only as reliable as those services.
- **Free-tier cold starts.** The Render free tier sleeps after inactivity, so the first request after idle can take 30–60 seconds. The README documents an UptimeRobot warm-ping and a pre-submission wake-up; a paid tier removes this entirely.
- **Ephemeral storage without Upstash.** On the free file store, live-generated guide permalinks are wiped on redeploy. Durable, shareable links require the optional Upstash Redis configuration.
- **The agent plans, it does not act.** It explains how to obtain a token and what a human must do; it never performs the OAuth flow, exchanges a code, or stores user credentials. That is a deliberate scope boundary, not an oversight.
- **Curated coverage is 14 apps.** Anything outside that set goes through live generation, which is slower and carries the caveats above.
- **Accessibility is strong but not formally audited.** The UI uses semantic landmarks, keyboard-operable controls, `aria-live` regions, and contrast targets, but full WCAG conformance needs manual assistive-technology testing that is out of scope here.
