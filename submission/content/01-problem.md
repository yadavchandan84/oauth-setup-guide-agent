# Problem understanding

Connecting an AI agent (or any product) to a third-party app over OAuth is rarely the hard part. The hard part is everything *around* the token: registering an app in a developer console, picking the right scopes, wiring redirect URIs, and — for many platforms — passing a review or verification process before the integration can serve real users.

That approval surface is wildly inconsistent across providers:

- **GitHub** gives you a working OAuth app in minutes with no review gate.
- **Google Workspace** can require OAuth verification plus a CASA security assessment that takes weeks when restricted scopes are involved.
- **Shopify** needs a Partner account, an App Store review, and a *separate* protected-customer-data approval for public apps.

An engineer wiring up a new integration has to rediscover each platform's rules from scratch, often scattered across docs that move, get renamed, or bury the approval timeline. The cost shows up as surprised deadlines ("we can't launch, Google verification is still pending") and over-broad scope requests that make review harder.

**The job to be done:** tell me, for a given app, *how hard* the OAuth approval is, *what I have to do*, *what an agent can do for me*, *how long approval takes*, and *where the landmines are* — with each claim traceable to an official source, so I can plan before I write a line of code.

This project answers that for 14 popular apps as a curated, verified library, and can generate the same structured guide live for any app the user names.
