# Use of agents

Agents were used in two distinct ways: **inside the product**, and **to build it**.

## Agents inside the product

The live generation pipeline is an agent in the literal sense: given only an app name or docs URL, it decides what to search, reads the results, drafts a structured guide, and runs a second verification pass that critiques its own draft against the retrieved sources. It is deliberately *bounded* — it searches and reads, but it never fetches arbitrary user URLs itself, never performs the OAuth flow, and never ships output that fails schema validation. The model proposes; deterministic code disposes.

## Agents to build the project

Development was done with an AI coding assistant under a planned, reviewed workflow rather than ad-hoc prompting:

- The work was decomposed into a design document and a set of discrete features, each with its own acceptance criteria and verification commands.
- Each feature was implemented against those criteria, then checked by running the project's real build, type-check, and test suites — not by eyeballing output.
- **Curated content was researched, not hallucinated.** Every cited URL was actually retrieved during research before being used to back a claim, and the link checker re-confirms all of them. Where an official page did not state a figure (approval wait times, for example), the section is marked `community` rather than invented as `verified`.

## Honesty over polish

The guiding rule throughout: a confident-sounding wrong answer is worse than an honest "uncertain." That shows up in the schema (three confidence levels, source references per section), in the pipeline (confidence capping, URL allow-listing), and in the content (open questions logged as `uncertain` instead of smoothed over).
