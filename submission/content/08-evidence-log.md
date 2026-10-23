# Evidence and verification log

Every curated guide was researched against official documentation on **20 October 2026**, and every cited URL is re-checked by `scripts/check-links.mjs`. The table below is generated from the committed `shared/link-check-report.json`.

For curated guides, "confirmed" or `verified` means two things: the cited URL resolves, and the claim matched the page as read on 2026-10-20. The GitHub, Jira, Linear and Shopify guides were re-read against their cited pages on 2026-10-23.

{{LINK_CHECK_TABLE}}

## Learned (docs that have moved or been renamed)

- **Slack** — developer docs moved from `api.slack.com` to `docs.slack.dev`; guides cite the current URLs.
- **Stripe** — docs moved from `stripe.com/docs` to `docs.stripe.com`.
- **Discord** — developer docs moved from `discord.com/developers/docs` to `docs.discord.com/developers`.
- **HubSpot** — OAuth pages now live under a `legacy-apps/` path, reflecting the move to the newer projects platform. The new-vs-legacy flow for a brand-new app is logged as `uncertain`.
- **Microsoft** — "Azure AD" is now "Microsoft Entra ID"; guides cite the `learn.microsoft.com/entra` identity-platform URLs.
- **Google** — the OAuth verification help page is now at `support.google.com/cloud/answer/13463073`.

## Corrected (claims changed after reading the source)

- **Figma** — the review question was *resolved*, not left open. The official OAuth-apps page states that public OAuth apps are reviewed by Figma on publish and can only authorize users after approval (private/draft apps are not reviewed). The guide was switched to `review.required: true`, review type `app-review`, with a publish-review stage; the exact turnaround is unpublished and stays `community`.
- **Website redirects normalized** — Notion (`www.notion.so` → `www.notion.com`), Zoom (`zoom.us` → `www.zoom.com`), and Microsoft (`learn.microsoft.com` → `learn.microsoft.com/en-us/`) app websites were updated to their final URLs.

## Unverified / treated as community or uncertain

- **Approval-wait durations** for review processes (Google CASA, Shopify App Store, Zoom, Microsoft publisher verification) are **community-reported** — providers rarely publish fixed SLAs — so those figures are never marked `verified`.
- **Author-estimated hands-on times** are `community`.
- **Salesforce** — `developer.salesforce.com` returns HTTP 403 to automated fetches (bot protection) but is reachable to a browser-like client and to the link checker; it is cited as official with that caveat recorded.
- A handful of report entries show as **redirected** rather than broken and are intentionally left as-is: a GitHub console URL behind a login gate, and region/locale geo-redirects (Slack, Stripe, Salesforce) that differ per reviewer region, where "correcting" to a geo-specific URL would itself be wrong.
