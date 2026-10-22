# Scope decision and rationale

## What this is

A full-stack **OAuth Approval Guide Agent**: a curated library of 14 verified guides plus a live agent that generates a guide for any app on demand. Every guide uses one schema, so curated and live output are structurally identical and directly comparable.

## Why a curated library *and* a live agent

A take-home that only generated guides live would be slow and fragile in front of a reviewer: an agent that searches docs and calls an LLM takes 30–90 seconds, depends on third-party uptime, and costs money per run. A library that was *only* curated would not demonstrate the agent at all.

The chosen split gets both:

- The **frontend bundles the 14 curated guides**, so the library is fully browsable with zero backend calls — it works instantly even while the free Render backend is cold.
- The **live agent** is a real, streaming pipeline the reviewer can trigger, with progress shown step by step over Server-Sent Events so the wait reads as intentional.

## Deployment shape

- **Frontend → Vercel** (React + Vite SPA). One static deploy, no cold start.
- **Backend → Render** (Node + Express). A long-lived server has no serverless timeout, so a 90-second agent run streams cleanly. The free tier sleeps after inactivity; the README documents an UptimeRobot warm-ping and a pre-submission wake-up.

## Explicit non-goals

- **No token exchange / no acting on the user's behalf.** The agent explains *how* to get a token and what a human must do; it never performs the OAuth flow or stores user credentials. This keeps the security surface small and the scope honest.
- **No logo hot-linking.** Guides use a monogram and brand color, not trademarked image assets.
- **No invented facts.** A section is marked `verified` only when an official URL that passes the link checker backs it. Approval-wait figures that no official page states are marked `community`, and genuinely open questions are marked `uncertain`.
- **No video walkthrough.** The submission is this PDF plus the live links.
