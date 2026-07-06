# LQ-AI Work Pipeline

A standalone, GitHub-Pages-published live board for the `LegalQuants/lq-ai`
deferred-enhancement (`DE-XXX`) backlog. See the design + plan in
`docs/superpowers/`.

- **Data:** rebuilt hourly by `.github/workflows/build.yml` from the public
  PRD §9 + the lq-ai issues/PRs API. The page also does a client-side live overlay
  so newly-opened issues show as claimed instantly.
- **Claim status is deterministic:** an item is `claimed`/`in-pr`/`done` only when an
  issue or PR cites its `DE-XXX` id. Embeddings only suggest *related* items.
- **Labels:** `theme` comes from PRD §9 headings; `status`/`owner` from GitHub state.
  `track`/`area`/`skills`/`difficulty` are tagged by keyword heuristic (`src/tagger.mjs`),
  optionally upgraded by an **LLM tagging pass** (`src/llm-tagger.mjs`, Claude Haiku 4.5
  with structured output + content-hash cache). The keyword tagger is the fallback.
- **Enable the LLM tagger:** set an `ANTHROPIC_API_KEY` repo secret (CI) or
  `export ANTHROPIC_API_KEY=…` (local). Without it, the build uses keyword tags.
- **Run locally:** `npm ci && node src/build.mjs && (cd docs/future-work && python3 -m http.server 8000)`
- **Tests:** `npm test`.
