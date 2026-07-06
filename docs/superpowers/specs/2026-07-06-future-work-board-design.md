# Future Work Board — Design Spec

**Date:** 2026-07-06
**Status:** Approved design, pre-implementation
**Supersedes:** the `docs/future-work/` "Future Work Radar" prototype

## 1. Purpose

A live, interactive, public web page that shows the full backlog of deferred
enhancements ("DE-XXX") and issues in the `LegalQuants/lq-ai` project so that:

- Contributors can **browse and claim** available work, filtered by track and interest.
- Anyone can see **what others are already working on** (claimed / in-PR / merged).
- Anyone can ask **"has this been built or asked before?"** before starting or filing.

The board is **standalone**, lives in this `visualize` repo, and is published to
GitHub Pages. It reads `lq-ai`'s **public** data; it requires no write access to
`lq-ai` and no runtime server.

## 2. Background & findings

`LegalQuants/lq-ai` is a public, active repo. Its PRD `docs/PRD.md` §9
("Deferred Enhancements and Identified Future Work") holds 100+ enhancements with
**stable `DE-XXX` IDs** (IDs run past DE-358), grouped into thematic subsections:
*Capability extensions · Security & compliance · Workflow intelligence · Engineering discipline*.

Crucially, **issues and PRs already cite `DE-XXX` IDs in their titles/bodies**
(e.g. `DE-296 — Tabular wizard`, PR #265 `(DE-035)`, `DE-201/202/208/209`).
This makes claim-detection a **deterministic ID lookup**, not a fuzzy-match guess.

The existing prototype (`docs/future-work/`) is a vanilla static dashboard fed by a
generator script, but it (a) runs on stale demo seed data, (b) treats fuzzy semantic
matching as the *primary* linkage, and (c) is a flat list with no claim flow, no
history, and no "already done?" search. This design inverts (b), replaces (a) with
live data, and restructures (c).

`houfu/lq-ai#1` is worth borrowing from: it reframes the backlog for humans into
**four contributor tracks** (self-hosting-docs · junior-code · docs-quality ·
legal-domain), each item with a skill tag + acceptance criteria + a peer-framed
"I'm picking up: …" issue template. We adopt the tracks and the claim template.

## 3. Requirements

| # | Requirement | How it is met |
|---|---|---|
| A | **Interactivity** — filter by issue and track | Client-side filters/search/sort over loaded JSON (theme, track, area, skill, difficulty, status, owner). |
| B | **Real-time** — claimed items reflected asap | Two layers: CI cron rebuild (~5 min) as baseline **+** client-side live GitHub API overlay on page load (instant per visit). |
| C | **Semantic understanding** — match issues/PRs to DEs without exact PRD words | Deterministic `DE-XXX` trunk + keyless local-embedding safety net computed in CI, surfaced as "likely related — confirm?" (never auto-claimed). |
| D | **"Has this been built/asked before?"** | Search-first landing over *all* DEs + *all* issues + *all* PRs incl. closed/merged; Done lane keeps history visible. |

## 4. Architecture

Static site + a build robot, both in this repo. No runtime server.

```
GitHub Action  (schedule: ~5 min · workflow_dispatch · on push to main)
  1. Fetch lq-ai PRD.md (raw.githubusercontent, public) → parse §9 → DE items + themes
  2. Fetch lq-ai issues + PRs, open AND closed (GitHub API, workflow GITHUB_TOKEN, ~1000/hr)
  3. Deterministic link: regex /DE-\d{3}/ in issue/PR title+body → status, owner, links
  4. Semantic pass (local, keyless): embed DE + issue + PR text → link untagged, cluster near-dupes
  5. Emit  data/future-work.json  +  data/search-index.json  → deploy to GitHub Pages

Browser (static page, vanilla HTML/CSS/JS)
  6. Render from prebuilt JSON (fast first paint; works if API unreachable)
  7. Client-side live overlay: fetch open issues/PRs from api.github.com → instant claim status
```

**Freshness model:** cron keeps the baseline current within ~5 min; the client-side
overlay makes claims appear the instant a visitor loads the page. If later the
project gains write access to `lq-ai`, an `on: issues` / `on: pull_request` workflow
there can `repository_dispatch` this repo for ~1-min rebuilds — no architecture change.

**No secrets:** the workflow's built-in `GITHUB_TOKEN` reads public data; embeddings
run on a local model in CI; the browser calls the GitHub API unauthenticated.

## 5. Data model

One record per DE item (the unit of claiming):

```jsonc
{
  "id": "DE-296",
  "title": "Tabular wizard: Project + free-pick document sources",
  "description": "…full text from PRD §9…",
  "prdAnchor": "https://github.com/LegalQuants/lq-ai/blob/main/docs/PRD.md#…",
  "theme": "Workflow intelligence",          // PRD subsection — authoritative
  "track": "junior-code",                     // contributor lens (4 tracks)
  "area": ["web", "api"],                     // build-time tags
  "skills": ["react", "python"],
  "difficulty": "medium",                     // small | medium | large
  "status": "in-pr",                          // available | claimed | in-pr | done
  "owner": "thepranky",                       // issue assignee / author, else null
  "links": {
    "issues": [{ "number": 222, "url": "…", "state": "open" }],
    "prs":    [{ "number": 265, "url": "…", "state": "open", "merged": false }],
    "prd":    "…#9"
  },
  "related": [                                // semantic neighbours — confirm, never auto-claim
    { "kind": "de", "id": "DE-201", "score": 0.71 },
    { "kind": "issue", "number": 212, "score": 0.63 }
  ]
}
```

Plus a top-level `search-index.json` covering **all** DEs + issues + PRs (incl.
closed/merged) for the landing search, and a `meta` block (generatedAt, counts,
source URLs).

## 6. The four-lens clustering model

Every item is clustered on four independent axes; each serves a different use case.

1. **Theme** (primary) — parsed directly from PRD §9 subsection headers. Deterministic
   and authoritative; we mirror the PRD's own taxonomy rather than invent one.
2. **Track** — contributor audience/skill lens (self-hosting-docs · junior-code ·
   docs-quality · legal-domain), borrowed from `houfu#1`. Answers "can I pick this up."
3. **Status lane** (Kanban) — Available → Claimed → In-PR → Done. Answers "what's free /
   what's happening." Closed & merged DEs stay in **Done** for history + momentum.
4. **Semantic cluster** — embeddings group near-duplicate DEs/issues/PRs. Powers the
   "has this been asked before?" search and links untagged issues to their DE.

### How each cluster is identified

- **Theme / track / skills / area:** deterministic parse of PRD structure, plus a
  cached rule-based + optional one-time LLM tagging pass at build. (Rules first; LLM
  only if accuracy needs it — keyless path preferred.)
- **Claim / status:** deterministic. Regex `DE-XXX` from issue/PR title+body,
  cross-referenced with GitHub open/closed/merged state and assignee. No guessing.
- **Semantic links:** local MiniLM embeddings + cosine similarity, thresholded, as a
  *fallback* for items that discuss a DE without citing its ID. Surfaced as
  "likely related — confirm?"; clusters labeled by top keywords. Never auto-claims.

**Principle: deterministic ID matching is the trunk; semantic understanding is the
safety net.** (The prototype had this backwards.)

## 7. The page — views

Vanilla HTML/CSS/JS (matches the existing prototype; no framework).

- **Landing (search-first):** a prominent search box — *"Has this been built or asked
  before?"* — running semantic + keyword search across all DEs + all issues + all PRs
  including closed/merged. Results show item, status, and links. This is the home view.
- **Board view:** Kanban lanes (Available → Claimed → In-PR → Done); swimlanes toggle
  between **theme** and **track**.
- **Filters (client-side, instant):** theme, track, area, skill, difficulty, status, owner.
- **Item detail:** description, PRD link, linked issues/PRs, status timeline, and an
  **"I'm picking up this"** button → pre-filled issue via `houfu#1`'s peer-framed
  template (`I'm picking up: <DE-ID> <title>`, source anchor, "weigh in on my approach").
- **Activity strip:** recent claims / open PRs / merges = "what others are working on."

## 8. Components (isolation & testability)

| Unit | Responsibility | Interface | Depends on |
|---|---|---|---|
| `prd-parser` | PRD §9 markdown → DE items + themes | `parsePrd(md) → Item[]` | none (pure) |
| `github-fetch` | Pull issues+PRs (open+closed), paginated | `fetchActivity(repo, token) → {issues, prs}` | GitHub API |
| `linker` | Deterministic DE-ID → status/owner/links | `link(items, activity) → Item[]` | none (pure) |
| `semantic` | Embed + neighbours + clusters (keyless) | `enrich(items, activity) → Item[]` | local model |
| `builder` | Compose JSON + search index, write files | `build() → files` | above units |
| `web/` | Static render, filters, board, search, overlay | static assets | JSON files, GitHub API (client) |
| `.github/workflows/` | Cron + dispatch orchestration + Pages deploy | workflow yaml | builder |

Each build unit is a pure function with a small typed input/output → unit-testable
without network (fixtures for PRD + API responses).

## 9. Error handling & degradation

- PRD fetch fails → keep last committed JSON, mark `meta.stale=true`, banner on page.
- GitHub API fails in CI → build DE catalog from PRD only, empty activity, note it.
- Client overlay fetch fails / rate-limited → silently fall back to baseline JSON.
- Semantic model unavailable → skip `related`; deterministic links unaffected.
- Unparseable DE entry → skip with a build-log warning; never crash the build.

## 10. Testing

- **Unit:** `prd-parser`, `linker`, `semantic` thresholding against fixtures
  (a sample PRD §9 + sample issue/PR payloads with and without DE-IDs).
- **Integration:** full `builder` run against recorded fixtures → snapshot the JSON.
- **Manual/e2e:** load the page against a fixture JSON; verify filters, board lanes,
  search, claim-template link, and the client overlay path (mock `api.github.com`).

## 11. Non-goals (YAGNI)

- No runtime backend / database / auth.
- No writing back to `lq-ai` (no auto-labeling issues, no bot claiming).
- No hosted embedding API or LLM at runtime.
- Dependabot PRs are excluded from the board (noise); optionally counted in `meta`.
- No framework/build-tooling beyond what CI needs to run the generator.

## 12. Open items to confirm in planning

- Exact PRD §9 subsection list (fetch full §9 to pin the theme taxonomy).
- Track-assignment rules (map theme/skills/difficulty → one of the four tracks).
- Semantic similarity threshold + which local model (`all-MiniLM-L6-v2` default).
- Pages publishing branch/path and final URL.
