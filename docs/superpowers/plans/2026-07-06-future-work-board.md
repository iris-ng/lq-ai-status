# Future Work Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone, GitHub-Pages-published live board that shows the `LegalQuants/lq-ai` deferred-enhancement (`DE-XXX`) backlog with real-time claim status, four-lens clustering, and a "has this been built/asked before?" search.

**Architecture:** A Node build pipeline (run by a GitHub Action on a ~5-min cron) fetches the public lq-ai PRD §9 and its issues/PRs, links them deterministically by `DE-XXX` ID, enriches with keyless local MiniLM embeddings for semantic fallback links + related clusters, and emits static JSON. A vanilla-JS static page renders that JSON and does a client-side live GitHub API overlay for instant claim status.

**Tech Stack:** Node ≥20 (ESM), `@xenova/transformers` (Transformers.js — local `all-MiniLM-L6-v2`, no API key), `node:test` + `node:assert` for tests, vanilla HTML/CSS/JS frontend, GitHub Actions + `actions/deploy-pages`.

## Global Constraints

- **Language/runtime:** Node ≥20, ESM only (`"type": "module"`), file extension `.mjs` for source, `.test.mjs` for tests.
- **No secrets, no runtime server:** CI uses the built-in `GITHUB_TOKEN` (read public data). Embeddings run locally in CI. The browser calls `api.github.com` unauthenticated (60 req/hr/IP) and degrades to the prebuilt JSON.
- **Deterministic trunk, semantic net:** claim status/ownership come ONLY from `DE-XXX` regex + GitHub state. Embeddings NEVER change claim status — they only populate `related` suggestions.
- **DE-ID regex (canonical, use verbatim):** `/\bDE-(\d{2,4})\b/g` (case-sensitive `DE`).
- **Published directory:** `docs/future-work/` (Pages artifact root). Build outputs land there.
- **Status vocabulary:** `available` | `claimed` | `in-pr` | `done`.
- **Track vocabulary:** `self-hosting-docs` | `junior-code` | `docs-quality` | `legal-domain`.
- **Exclude** dependabot and other bot authors from the board (count them only in `meta`).
- **Target repo:** `LegalQuants/lq-ai` (public). PRD raw URL: `https://raw.githubusercontent.com/LegalQuants/lq-ai/main/docs/PRD.md`.
- **DRY, YAGNI, TDD, commit after every green task.**

## Canonical types (referenced by every task)

```jsonc
// Item — one deferred enhancement (the unit of claiming)
{ "id": "DE-296", "title": "…", "description": "…", "prdAnchor": "https://…",
  "theme": "Workflow intelligence", "track": "junior-code",
  "area": ["web"], "skills": ["react"], "difficulty": "medium",
  "status": "available", "owner": null,
  "links": { "issues": [Ref], "prs": [Ref], "prd": "https://…" },
  "related": [ { "kind": "de"|"issue"|"pr", "ref": "DE-201"|212, "score": 0.71 } ] }

// Ref — a linked GitHub item
{ "number": 222, "url": "https://…", "state": "open"|"closed", "merged": false }

// Activity — a fetched issue or PR
{ "kind": "issue"|"pr", "number": 222, "title": "…", "body": "…", "url": "https://…",
  "state": "open"|"closed", "merged": false, "author": "thepranky",
  "assignee": "thepranky"|null, "labels": ["enhancement"] }
```

## File structure

```
package.json                         # ESM, scripts, @xenova/transformers dep
src/
  prd-parser.mjs      parsePrd(md, prdUrl) -> { items, themes }
  tagger.mjs          tagItem(item) -> item(+track,area,skills,difficulty)
  github-fetch.mjs    fetchActivity({repo, token, fetchImpl?}) -> { issues, prs, botCount }
  linker.mjs          link(items, activity) -> { items, unlinked }
  embed.mjs           makeEmbedder() -> (text)=>Promise<number[]>;  cosine(a,b)
  semantic.mjs        enrich({items, unlinked, activity, embed, threshold}) -> { items, searchIndex }
  build.mjs           build({prdUrl, repo, token, embed, outDir, now}) -> writes JSON
web/                                  # copied into docs/future-work by build/workflow
  lib.mjs             pure UI helpers (filter/group/search/render) — unit tested
docs/future-work/
  index.html          shell (search-first landing + board + detail)
  app.js              DOM wiring + client-side live overlay (imports lib.mjs)
  styles.css
  future-work.json    (build output)
  search-index.json   (build output)
test/
  fixtures/{prd-sample.md, activity.json}
  *.test.mjs
.github/workflows/build.yml
```

---

### Task 1: Project scaffold + test runner

**Files:**
- Create: `package.json`
- Create: `test/smoke.test.mjs`

**Interfaces:**
- Produces: `npm test` (runs `node --test`), `npm run build` (runs `node src/build.mjs`).

- [ ] **Step 1: Write the failing test**

`test/smoke.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";

test("test runner works", () => {
  assert.equal(1 + 1, 2);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — `npm error Missing script: "test"` (no package.json yet).

- [ ] **Step 3: Create package.json**

`package.json`:
```json
{
  "name": "lq-future-work-board",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "node --test",
    "build": "node src/build.mjs"
  },
  "dependencies": {
    "@xenova/transformers": "^2.17.2"
  }
}
```

- [ ] **Step 4: Install deps and run tests**

Run: `npm install && npm test`
Expected: PASS — `tests 1 ... pass 1`. (`npm install` downloads Transformers.js; the MiniLM weights download lazily on first embed, not now.)

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json test/smoke.test.mjs
git commit -m "chore: scaffold Node ESM project with node:test runner"
```

---

### Task 2: PRD §9 parser

**Files:**
- Create: `src/prd-parser.mjs`
- Create: `test/fixtures/prd-sample.md`
- Create: `test/prd-parser.test.mjs`

**Interfaces:**
- Produces: `parsePrd(markdown, prdUrl) -> { items: Item[], themes: string[] }`. Each item has `id, title, description, theme, prdAnchor` (tagging fields added later). `themes` is the ordered list of §9 subsection headings encountered.

**Design note:** The parser does NOT hardcode the theme list — it derives themes from the subsection headings physically present under §9, so it stays correct if the PRD reorganizes. It locates §9 by heading, reads until the next heading of equal-or-higher level, tracks the current subsection heading as `theme`, and emits one item per line containing a `DE-XXX` ID (bullet or table row). **Before the first real run, verify output against the live PRD** (Task 8, Step 6) since the exact §9 markup is only confirmed at build time.

- [ ] **Step 1: Write the fixture**

`test/fixtures/prd-sample.md`:
```markdown
# PRD

## 8. Something else
- not a DE item here

## 9. Deferred Enhancements and Identified Future Work

### 9.1 Workflow intelligence
- **DE-296**: Tabular wizard — Project + free-pick document sources for tabular extraction.
- **DE-201**: WorkspaceEvent contract. Define the shared event envelope.

### 9.2 Security and compliance
- **DE-035**: Amazon Bedrock provider adapter via Bedrock Mantle Endpoint.

## 10. Appendices
- **DE-999**: should NOT be parsed (outside section 9).
```

- [ ] **Step 2: Write the failing test**

`test/prd-parser.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parsePrd } from "../src/prd-parser.mjs";

const md = await readFile(new URL("./fixtures/prd-sample.md", import.meta.url), "utf8");
const PRD_URL = "https://example.com/PRD.md";
const { items, themes } = parsePrd(md, PRD_URL);

test("parses only DE items inside section 9", () => {
  assert.deepEqual(items.map((i) => i.id), ["DE-296", "DE-201", "DE-035"]);
});

test("captures theme from the enclosing subsection", () => {
  assert.equal(items.find((i) => i.id === "DE-296").theme, "Workflow intelligence");
  assert.equal(items.find((i) => i.id === "DE-035").theme, "Security and compliance");
});

test("splits title from description", () => {
  const it = items.find((i) => i.id === "DE-296");
  assert.equal(it.title, "Tabular wizard");
  assert.match(it.description, /free-pick document sources/);
});

test("sets a PRD anchor and lists themes in order", () => {
  assert.match(items[0].prdAnchor, /^https:\/\/example\.com\/PRD\.md#/);
  assert.deepEqual(themes, ["Workflow intelligence", "Security and compliance"]);
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `node --test test/prd-parser.test.mjs`
Expected: FAIL — `Cannot find module '../src/prd-parser.mjs'`.

- [ ] **Step 4: Implement the parser**

`src/prd-parser.mjs`:
```js
const DE_RE = /\bDE-(\d{2,4})\b/;

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// Strip a leading DE id + markdown emphasis/punctuation from a bullet/row.
function stripLead(text) {
  return text
    .replace(/^\s*[-*]\s+/, "")
    .replace(/^\|/, "")
    .replace(/\*\*/g, "")
    .replace(new RegExp(`^\\s*${DE_RE.source}\\s*[:|—–-]?\\s*`), "")
    .trim();
}

export function parsePrd(markdown, prdUrl) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((l) => /^#{1,3}\s*9\.\s*Deferred Enhancements/i.test(l));
  if (start === -1) return { items: [], themes: [] };
  const startLevel = lines[start].match(/^#+/)[0].length;

  const items = [];
  const themes = [];
  let theme = "General";

  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      if (heading[1].length <= startLevel) break; // left section 9
      theme = heading[2].replace(/^\d+(\.\d+)*\s*/, "").trim(); // "9.1 Workflow…" -> "Workflow…"
      if (!themes.includes(theme)) themes.push(theme);
      continue;
    }
    const m = line.match(DE_RE);
    if (!m) continue;
    const id = `DE-${m[1]}`;
    const rest = stripLead(line);
    const title = rest.split(/\s+[—–-]\s+|[.:;]\s+/)[0].slice(0, 90).trim();
    items.push({
      id,
      title: title || id,
      description: rest,
      theme,
      prdAnchor: `${prdUrl}#${slug(theme)}`,
    });
  }
  return { items, themes };
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `node --test test/prd-parser.test.mjs`
Expected: PASS — 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/prd-parser.mjs test/prd-parser.test.mjs test/fixtures/prd-sample.md
git commit -m "feat: parse PRD section 9 into DE items with themes"
```

---

### Task 3: Tagger (track / area / skills / difficulty)

**Files:**
- Create: `src/tagger.mjs`
- Create: `test/tagger.test.mjs`

**Interfaces:**
- Consumes: an Item from `parsePrd`.
- Produces: `tagItem(item) -> item` with added `track` (one of the four track values), `area` (string[]), `skills` (string[]), `difficulty` (`small|medium|large`).

- [ ] **Step 1: Write the failing test**

`test/tagger.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { tagItem } from "../src/tagger.mjs";

test("legal-domain track from legal keywords", () => {
  const t = tagItem({ id: "DE-1", title: "GDPR statutory graph", description: "trademark authority source", theme: "x" });
  assert.equal(t.track, "legal-domain");
});

test("self-hosting-docs track from deploy/docs keywords", () => {
  const t = tagItem({ id: "DE-2", title: "Document self-hosting with Caddy", description: "docker deploy guide", theme: "x" });
  assert.equal(t.track, "self-hosting-docs");
});

test("difficulty large for architecture words", () => {
  const t = tagItem({ id: "DE-3", title: "Multi-agent handoff architecture", description: "refactor pipeline", theme: "x" });
  assert.equal(t.difficulty, "large");
});

test("area and skills inferred", () => {
  const t = tagItem({ id: "DE-4", title: "Web dashboard", description: "react frontend UI", theme: "x" });
  assert.ok(t.area.includes("web"));
  assert.ok(t.skills.includes("react"));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/tagger.test.mjs`
Expected: FAIL — `Cannot find module '../src/tagger.mjs'`.

- [ ] **Step 3: Implement the tagger**

`src/tagger.mjs`:
```js
const AREA_RULES = [
  ["web", ["ui", "ux", "frontend", "dashboard", "react", "vite", "canvas", "mermaid"]],
  ["api", ["api", "endpoint", "fastapi", "schema", "langgraph"]],
  ["gateway", ["gateway", "proxy", "provider", "bedrock", "routing"]],
  ["ai", ["rag", "model", "prompt", "embedding", "llm", "agent", "extraction"]],
  ["infra", ["deploy", "docker", "caddy", "tailscale", "ci", "redis", "observability"]],
  ["docs", ["docs", "documentation", "guide", "readme"]],
];
const SKILL_RULES = [
  ["react", ["react", "frontend", "vite"]],
  ["python", ["fastapi", "langgraph", "python", "api", "gateway"]],
  ["devops", ["docker", "caddy", "ci", "deploy", "tailscale"]],
  ["legal-research", ["gdpr", "trademark", "statute", "citation", "bluebook", "court"]],
  ["writing", ["docs", "documentation", "guide", "readme"]],
];

function matched(text, rules) {
  return rules.filter(([, words]) => words.some((w) => text.includes(w))).map(([name]) => name);
}

function inferTrack(text, area, skills) {
  if (skills.includes("legal-research")) return "legal-domain";
  if (area.includes("infra") || area.includes("docs")) {
    return area.includes("docs") && !area.includes("infra") ? "docs-quality" : "self-hosting-docs";
  }
  if (skills.includes("writing")) return "docs-quality";
  return "junior-code";
}

function inferDifficulty(text) {
  if (/(refactor|architecture|migration|multi-|pipeline|distributed|security|autonomous)/.test(text)) return "large";
  if (/(integrate|support|workflow|endpoint|dashboard|adapter|semantic)/.test(text)) return "medium";
  return "small";
}

export function tagItem(item) {
  const text = `${item.title} ${item.description}`.toLowerCase();
  const area = matched(text, AREA_RULES);
  const skills = matched(text, SKILL_RULES);
  return {
    ...item,
    area: area.length ? area : ["product"],
    skills,
    difficulty: inferDifficulty(text),
    track: inferTrack(text, area, skills),
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/tagger.test.mjs`
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tagger.mjs test/tagger.test.mjs
git commit -m "feat: rule-based track/area/skills/difficulty tagging"
```

---

### Task 4: GitHub activity fetch

**Files:**
- Create: `src/github-fetch.mjs`
- Create: `test/github-fetch.test.mjs`

**Interfaces:**
- Produces: `fetchActivity({ repo, token, fetchImpl = fetch }) -> Promise<{ issues: Activity[], prs: Activity[], botCount: number }>`. Pulls both open AND closed via the REST issues endpoint (`state=all`), separates PRs (items with a `pull_request` field) from issues, resolves PR `merged` state, and excludes bot authors (counted in `botCount`). `fetchImpl` is injectable for tests.

- [ ] **Step 1: Write the failing test**

`test/github-fetch.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchActivity } from "../src/github-fetch.mjs";

function fakeFetch(pages) {
  let call = 0;
  return async () => {
    const body = pages[call] ?? [];
    call += 1;
    return { ok: true, status: 200, json: async () => body };
  };
}

const page1 = [
  { number: 222, title: "DE-296 wizard", body: "", html_url: "u/222", state: "open",
    user: { login: "thepranky", type: "User" }, assignee: null, labels: [{ name: "enhancement" }] },
  { number: 265, title: "feat (DE-035)", body: "", html_url: "u/265", state: "open",
    user: { login: "dropthejase", type: "User" }, assignee: null, labels: [],
    pull_request: { merged_at: null } },
  { number: 132, title: "bump uvicorn", body: "", html_url: "u/132", state: "open",
    user: { login: "dependabot[bot]", type: "Bot" }, assignee: null, labels: [],
    pull_request: { merged_at: null } },
];

test("separates issues from PRs and drops bots", async () => {
  const { issues, prs, botCount } = await fetchActivity({
    repo: "o/r", token: "t", fetchImpl: fakeFetch([page1, []]),
  });
  assert.deepEqual(issues.map((i) => i.number), [222]);
  assert.deepEqual(prs.map((p) => p.number), [265]);
  assert.equal(botCount, 1);
  assert.equal(issues[0].kind, "issue");
  assert.equal(prs[0].kind, "pr");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/github-fetch.test.mjs`
Expected: FAIL — `Cannot find module '../src/github-fetch.mjs'`.

- [ ] **Step 3: Implement the fetcher**

`src/github-fetch.mjs`:
```js
const isBot = (u) => u?.type === "Bot" || /\[bot\]$/.test(u?.login ?? "");

function normalize(raw) {
  const isPr = Boolean(raw.pull_request);
  return {
    kind: isPr ? "pr" : "issue",
    number: raw.number,
    title: raw.title ?? "",
    body: raw.body ?? "",
    url: raw.html_url,
    state: raw.state,
    merged: isPr ? Boolean(raw.pull_request.merged_at) : false,
    author: raw.user?.login ?? null,
    assignee: raw.assignee?.login ?? null,
    labels: (raw.labels ?? []).map((l) => (typeof l === "string" ? l : l.name)),
  };
}

export async function fetchActivity({ repo, token, fetchImpl = fetch }) {
  const headers = { Accept: "application/vnd.github+json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const issues = [];
  const prs = [];
  let botCount = 0;
  for (let page = 1; page <= 20; page += 1) {
    const url = `https://api.github.com/repos/${repo}/issues?state=all&per_page=100&page=${page}`;
    const res = await fetchImpl(url, { headers });
    if (!res.ok) throw new Error(`GitHub API ${res.status} for ${url}`);
    const batch = await res.json();
    if (!batch.length) break;
    for (const raw of batch) {
      if (isBot(raw.user)) { botCount += 1; continue; }
      const item = normalize(raw);
      (item.kind === "pr" ? prs : issues).push(item);
    }
  }
  return { issues, prs, botCount };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/github-fetch.test.mjs`
Expected: PASS — 1 test (with 6 assertions) passes.

- [ ] **Step 5: Commit**

```bash
git add src/github-fetch.mjs test/github-fetch.test.mjs
git commit -m "feat: fetch and normalize lq-ai issues and PRs, excluding bots"
```

---

### Task 5: Deterministic DE-ID linker

**Files:**
- Create: `src/linker.mjs`
- Create: `test/fixtures/activity.json`
- Create: `test/linker.test.mjs`

**Interfaces:**
- Consumes: `items` (tagged), `activity = { issues, prs }`.
- Produces: `link(items, activity) -> { items, unlinked }`. Sets `status`, `owner`, `links.{issues,prs}` on each item by matching `DE-XXX` in activity title+body. `unlinked` is the array of Activity that referenced no known DE (candidates for semantic linking). Status precedence: merged PR → `done`; else closed issue/PR present → `done`; else open PR → `in-pr`; else open issue → `claimed`; else `available`.

- [ ] **Step 1: Write the fixture**

`test/fixtures/activity.json`:
```json
{
  "issues": [
    { "kind": "issue", "number": 222, "title": "DE-296 wizard", "body": "", "url": "u/222", "state": "open", "merged": false, "author": "thepranky", "assignee": "thepranky", "labels": ["enhancement"] },
    { "kind": "issue", "number": 900, "title": "Improve onboarding copy", "body": "no id here", "url": "u/900", "state": "open", "merged": false, "author": "kev", "assignee": null, "labels": [] }
  ],
  "prs": [
    { "kind": "pr", "number": 265, "title": "feat (DE-035) bedrock", "body": "", "url": "u/265", "state": "open", "merged": false, "author": "dropthejase", "assignee": null, "labels": [] }
  ]
}
```

- [ ] **Step 2: Write the failing test**

`test/linker.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { link } from "../src/linker.mjs";

const activity = JSON.parse(await readFile(new URL("./fixtures/activity.json", import.meta.url), "utf8"));
const items = [
  { id: "DE-296", links: {} }, { id: "DE-035", links: {} }, { id: "DE-201", links: {} },
];
const { items: linked, unlinked } = link(items, activity);
const byId = Object.fromEntries(linked.map((i) => [i.id, i]));

test("open issue -> claimed with owner", () => {
  assert.equal(byId["DE-296"].status, "claimed");
  assert.equal(byId["DE-296"].owner, "thepranky");
  assert.deepEqual(byId["DE-296"].links.issues.map((r) => r.number), [222]);
});

test("open PR -> in-pr", () => {
  assert.equal(byId["DE-035"].status, "in-pr");
  assert.equal(byId["DE-035"].owner, "dropthejase");
});

test("no references -> available", () => {
  assert.equal(byId["DE-201"].status, "available");
  assert.equal(byId["DE-201"].owner, null);
});

test("activity with no known DE id becomes unlinked", () => {
  assert.deepEqual(unlinked.map((a) => a.number), [900]);
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `node --test test/linker.test.mjs`
Expected: FAIL — `Cannot find module '../src/linker.mjs'`.

- [ ] **Step 4: Implement the linker**

`src/linker.mjs`:
```js
const DE_RE = /\bDE-(\d{2,4})\b/g;

function idsIn(activity) {
  const text = `${activity.title} ${activity.body}`;
  const found = new Set();
  for (const m of text.matchAll(DE_RE)) found.add(`DE-${m[1]}`);
  return found;
}

function toRef(a) {
  return { number: a.number, url: a.url, state: a.state, merged: a.merged };
}

function statusFor(issues, prs) {
  if (prs.some((p) => p.merged)) return "done";
  if ([...issues, ...prs].some((x) => x.state === "closed")) return "done";
  if (prs.some((p) => p.state === "open")) return "in-pr";
  if (issues.some((i) => i.state === "open")) return "claimed";
  return "available";
}

function ownerFor(issues, prs) {
  const openIssue = issues.find((i) => i.state === "open");
  if (openIssue) return openIssue.assignee || openIssue.author;
  const openPr = prs.find((p) => p.state === "open");
  if (openPr) return openPr.author;
  return null;
}

export function link(items, activity) {
  const all = [...activity.issues, ...activity.prs];
  const known = new Set(items.map((i) => i.id));
  const refs = new Map(items.map((i) => [i.id, { issues: [], prs: [] }]));

  for (const a of all) {
    for (const id of idsIn(a)) {
      if (refs.has(id)) refs.get(id)[a.kind === "pr" ? "prs" : "issues"].push(a);
    }
  }

  const linkedItems = items.map((item) => {
    const { issues, prs } = refs.get(item.id);
    return {
      ...item,
      status: statusFor(issues, prs),
      owner: ownerFor(issues, prs),
      links: { ...item.links, issues: issues.map(toRef), prs: prs.map(toRef) },
    };
  });

  const unlinked = all.filter((a) => ![...idsIn(a)].some((id) => known.has(id)));
  return { items: linkedItems, unlinked };
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `node --test test/linker.test.mjs`
Expected: PASS — 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/linker.mjs test/linker.test.mjs test/fixtures/activity.json
git commit -m "feat: deterministic DE-id linking of issues/PRs to items"
```

---

### Task 6: Embedding wrapper + cosine

**Files:**
- Create: `src/embed.mjs`
- Create: `test/embed.test.mjs`

**Interfaces:**
- Produces: `cosine(a, b) -> number` (dot product of equal-length arrays; MiniLM vectors are pre-normalized so this equals cosine similarity). `makeEmbedder() -> Promise<(text) => Promise<number[]>>` lazily loads `Xenova/all-MiniLM-L6-v2`. The embedder is dependency-injected into `semantic`/`build`, so only `cosine` needs a fast unit test; the model itself is exercised in the Task 8 real-run verification.

- [ ] **Step 1: Write the failing test**

`test/embed.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { cosine } from "../src/embed.mjs";

test("cosine of identical vectors is 1", () => {
  assert.equal(cosine([1, 0, 0], [1, 0, 0]), 1);
});

test("cosine of orthogonal vectors is 0", () => {
  assert.equal(cosine([1, 0], [0, 1]), 0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/embed.test.mjs`
Expected: FAIL — `Cannot find module '../src/embed.mjs'`.

- [ ] **Step 3: Implement embed.mjs**

`src/embed.mjs`:
```js
export function cosine(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += a[i] * b[i];
  return dot;
}

export async function makeEmbedder() {
  const { pipeline } = await import("@xenova/transformers");
  const extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  return async (text) => {
    const out = await extractor(text.slice(0, 2000), { pooling: "mean", normalize: true });
    return Array.from(out.data);
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/embed.test.mjs`
Expected: PASS — 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/embed.mjs test/embed.test.mjs
git commit -m "feat: local MiniLM embedder wrapper and cosine similarity"
```

---

### Task 7: Semantic enrichment + search index

**Files:**
- Create: `src/semantic.mjs`
- Create: `test/semantic.test.mjs`

**Interfaces:**
- Consumes: `{ items, unlinked, activity, embed, threshold }` where `embed` is an async `(text) => number[]` (injected — tests pass a fake). `activity = { issues, prs }`.
- Produces: `enrich(...) -> Promise<{ items, searchIndex }>`. Adds `related` to each item: nearest OTHER DEs and any `unlinked` activity whose similarity ≥ `threshold` (default `0.45`), each `{ kind, ref, score }`, sorted desc, capped at 5. NEVER mutates `status`/`owner`. `searchIndex` is a lightweight array over ALL DEs + issues + PRs (no embeddings shipped): `{ kind, ref, title, text, status?, url?, theme?, track? }`.

- [ ] **Step 1: Write the failing test**

`test/semantic.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { enrich } from "../src/semantic.mjs";

// Fake embedder: map known phrases to fixed unit vectors so similarity is deterministic.
const VECS = {
  wizard: [1, 0, 0], tabular: [0.98, 0.2, 0], bedrock: [0, 1, 0], onboarding: [0, 0, 1],
};
const pick = (text) => {
  const key = Object.keys(VECS).find((k) => text.toLowerCase().includes(k));
  return key ? VECS[key] : [0, 0, 0];
};
const embed = async (t) => pick(t);

const items = [
  { id: "DE-296", title: "Tabular wizard", description: "", theme: "x", track: "junior-code", status: "available", links: {} },
  { id: "DE-035", title: "Bedrock adapter", description: "", theme: "x", track: "junior-code", status: "in-pr", links: {} },
];
const unlinked = [
  { kind: "issue", number: 900, title: "wizard onboarding", body: "", url: "u/900", state: "open" },
];

test("links unlinked activity to nearest DE above threshold", async () => {
  const { items: out } = await enrich({ items, unlinked, activity: { issues: unlinked, prs: [] }, embed, threshold: 0.45 });
  const de296 = out.find((i) => i.id === "DE-296");
  assert.ok(de296.related.some((r) => r.kind === "issue" && r.ref === 900));
});

test("does not change status", async () => {
  const { items: out } = await enrich({ items, unlinked, activity: { issues: unlinked, prs: [] }, embed, threshold: 0.45 });
  assert.equal(out.find((i) => i.id === "DE-296").status, "available");
});

test("search index covers items and activity", async () => {
  const { searchIndex } = await enrich({ items, unlinked, activity: { issues: unlinked, prs: [] }, embed, threshold: 0.45 });
  assert.ok(searchIndex.some((e) => e.kind === "de" && e.ref === "DE-296"));
  assert.ok(searchIndex.some((e) => e.kind === "issue" && e.ref === 900));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/semantic.test.mjs`
Expected: FAIL — `Cannot find module '../src/semantic.mjs'`.

- [ ] **Step 3: Implement semantic.mjs**

`src/semantic.mjs`:
```js
import { cosine } from "./embed.mjs";

const textOf = (x) => `${x.title ?? ""} ${x.description ?? x.body ?? ""}`.trim();

export async function enrich({ items, unlinked, activity, embed, threshold = 0.45 }) {
  const itemVecs = new Map();
  for (const it of items) itemVecs.set(it.id, await embed(textOf(it)));

  const unlinkedVecs = [];
  for (const a of unlinked) unlinkedVecs.push({ a, v: await embed(textOf(a)) });

  const enriched = items.map((it) => {
    const v = itemVecs.get(it.id);
    const related = [];
    for (const other of items) {
      if (other.id === it.id) continue;
      const score = cosine(v, itemVecs.get(other.id));
      if (score >= threshold) related.push({ kind: "de", ref: other.id, score });
    }
    for (const { a, v: av } of unlinkedVecs) {
      const score = cosine(v, av);
      if (score >= threshold) related.push({ kind: a.kind, ref: a.number, score });
    }
    related.sort((x, y) => y.score - x.score);
    return { ...it, related: related.slice(0, 5) };
  });

  const searchIndex = [
    ...enriched.map((it) => ({
      kind: "de", ref: it.id, title: `${it.id}: ${it.title}`, text: textOf(it),
      status: it.status, theme: it.theme, track: it.track, url: it.prdAnchor,
    })),
    ...[...activity.issues, ...activity.prs].map((a) => ({
      kind: a.kind, ref: a.number, title: `#${a.number}: ${a.title}`, text: textOf(a),
      status: a.state === "closed" ? "done" : a.kind, url: a.url,
    })),
  ];

  return { items: enriched, searchIndex };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/semantic.test.mjs`
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/semantic.mjs test/semantic.test.mjs
git commit -m "feat: semantic related-links and search index (status untouched)"
```

---

### Task 8: Build orchestrator

**Files:**
- Create: `src/build.mjs`
- Create: `test/build.test.mjs`

**Interfaces:**
- Consumes: all prior modules. `build({ prdUrl, repo, token, embed, outDir, now, fetchImpl })` — orchestrates parse → tag → fetch → link → enrich → write `future-work.json` and `search-index.json` to `outDir`. `now` is an injected ISO timestamp string (deterministic tests). `embed` and `fetchImpl` injectable. Returns the assembled data object.
- Produces: on error at any external step, degrades per spec §9 (keeps DE catalog from PRD, empty activity, `meta.warnings`).

- [ ] **Step 1: Write the failing test**

`test/build.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "../src/build.mjs";

const prdMd = await readFile(new URL("./fixtures/prd-sample.md", import.meta.url), "utf8");
const embed = async () => [1, 0, 0]; // all identical -> deterministic
const okFetch = async () => ({ ok: true, status: 200, json: async () => [] });

test("build writes future-work.json and search-index.json", async () => {
  const outDir = join(tmpdir(), `fwb-${process.pid}`);
  const data = await build({
    prdMarkdown: prdMd, prdUrl: "https://x/PRD.md", repo: "o/r", token: "t",
    embed, outDir, now: "2026-07-06T00:00:00.000Z", fetchImpl: okFetch,
  });
  assert.equal(data.meta.generatedAt, "2026-07-06T00:00:00.000Z");
  assert.ok(data.items.length >= 3);
  const written = JSON.parse(await readFile(join(outDir, "future-work.json"), "utf8"));
  assert.equal(written.items.length, data.items.length);
  const idx = JSON.parse(await readFile(join(outDir, "search-index.json"), "utf8"));
  assert.ok(Array.isArray(idx.entries));
  await rm(outDir, { recursive: true, force: true });
});

test("build degrades when fetch fails", async () => {
  const outDir = join(tmpdir(), `fwb-fail-${process.pid}`);
  const badFetch = async () => { throw new Error("network down"); };
  const data = await build({
    prdMarkdown: prdMd, prdUrl: "https://x/PRD.md", repo: "o/r", token: "t",
    embed, outDir, now: "2026-07-06T00:00:00.000Z", fetchImpl: badFetch,
  });
  assert.ok(data.meta.warnings.some((w) => /activity/i.test(w)));
  assert.ok(data.items.length >= 3); // DE catalog still built
  await rm(outDir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/build.test.mjs`
Expected: FAIL — `Cannot find module '../src/build.mjs'`.

- [ ] **Step 3: Implement build.mjs**

`src/build.mjs`:
```js
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parsePrd } from "./prd-parser.mjs";
import { tagItem } from "./tagger.mjs";
import { fetchActivity } from "./github-fetch.mjs";
import { link } from "./linker.mjs";
import { enrich } from "./semantic.mjs";

const REPO = "LegalQuants/lq-ai";
const PRD_URL = "https://raw.githubusercontent.com/LegalQuants/lq-ai/main/docs/PRD.md";
const PRD_HTML = "https://github.com/LegalQuants/lq-ai/blob/main/docs/PRD.md";

export async function build(opts = {}) {
  const {
    prdMarkdown, prdUrl = PRD_HTML, repo = REPO, token = process.env.GITHUB_TOKEN,
    embed, outDir, now = new Date().toISOString(), fetchImpl = fetch,
  } = opts;
  const warnings = [];

  let markdown = prdMarkdown;
  if (!markdown) {
    try { markdown = await (await fetchImpl(PRD_URL)).text(); }
    catch { warnings.push("Could not fetch PRD; used empty catalog."); markdown = ""; }
  }

  const { items: parsed, themes } = parsePrd(markdown, prdUrl);
  let items = parsed.map(tagItem);

  let activity = { issues: [], prs: [], botCount: 0 };
  try { activity = await fetchActivity({ repo, token, fetchImpl }); }
  catch (e) { warnings.push(`Could not fetch activity (${e.message}); showing catalog only.`); }

  const linkResult = link(items, activity);
  items = linkResult.items;

  const enriched = await enrich({
    items, unlinked: linkResult.unlinked, activity, embed, threshold: 0.45,
  });
  items = enriched.items;

  const counts = { total: items.length, themes: themes.length };
  for (const s of ["available", "claimed", "in-pr", "done"]) {
    counts[s] = items.filter((i) => i.status === s).length;
  }

  const data = {
    meta: {
      generatedAt: now, repo, prdUrl,
      issuesUrl: `https://github.com/${repo}/issues`,
      pullsUrl: `https://github.com/${repo}/pulls`,
      botPrCount: activity.botCount, counts, themes, warnings,
    },
    items,
  };

  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "future-work.json"), `${JSON.stringify(data, null, 2)}\n`);
  await writeFile(join(outDir, "search-index.json"),
    `${JSON.stringify({ generatedAt: now, entries: enriched.searchIndex }, null, 2)}\n`);
  return data;
}

// CLI entry: node src/build.mjs
if (import.meta.url === `file://${process.argv[1]}`) {
  const { makeEmbedder } = await import("./embed.mjs");
  const embed = await makeEmbedder();
  const data = await build({ embed, outDir: "docs/future-work" });
  console.log(`Built ${data.items.length} items; warnings: ${data.meta.warnings.length}`);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/build.test.mjs`
Expected: PASS — 2 tests pass.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS — all tests across all files pass.

- [ ] **Step 6: Real-run verification against live lq-ai (CRITICAL — confirms PRD §9 parsing)**

Run: `node src/build.mjs`
Then inspect: `node -e "const d=require('./docs/future-work/future-work.json'); console.log(d.meta.counts); console.log(d.items.slice(0,5).map(i=>i.id+' '+i.status+' ['+i.theme+']'))"`
Expected: real DE IDs (e.g. `DE-296`, `DE-035`, `DE-201`) with plausible themes and statuses. **If item count is 0 or titles look wrong, the PRD §9 markup differs from the fixture — adjust `src/prd-parser.mjs` (`stripLead`/heading regex) to match the real format, re-run, and update `test/fixtures/prd-sample.md` to mirror the real structure.** This is the one place the plan's assumption about §9 markup must be reconciled with reality.

- [ ] **Step 7: Commit**

```bash
git add src/build.mjs test/build.test.mjs docs/future-work/future-work.json docs/future-work/search-index.json
git commit -m "feat: build orchestrator emitting future-work + search index JSON"
```

---

### Task 9: Frontend logic library (pure, testable)

**Files:**
- Create: `web/lib.mjs`
- Create: `test/lib.test.mjs`

**Interfaces:**
- Produces pure functions (no DOM), imported by both tests and `app.js`:
  - `filterItems(items, f) -> Item[]` where `f = { q, theme, track, area, difficulty, status }` ("all"/"" = no constraint; `q` matches id/title/description/skills).
  - `LANES = ["available","claimed","in-pr","done"]`; `groupByLane(items) -> { available:[], claimed:[], "in-pr":[], done:[] }`.
  - `searchCorpus(entries, q) -> entries[]` (case-insensitive substring over title+text, ranked title-match-first).
  - `claimUrl(item, repo) -> string` (pre-filled "I'm picking up:" issue URL).
  - `itemCardHtml(item, repo) -> string`.

- [ ] **Step 1: Write the failing test**

`test/lib.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { filterItems, groupByLane, searchCorpus, claimUrl, LANES } from "../web/lib.mjs";

const items = [
  { id: "DE-296", title: "Tabular wizard", description: "extract", skills: ["python"], theme: "Workflow intelligence", track: "junior-code", area: ["web"], difficulty: "medium", status: "available" },
  { id: "DE-035", title: "Bedrock adapter", description: "gateway", skills: ["python"], theme: "Security and compliance", track: "junior-code", area: ["gateway"], difficulty: "large", status: "in-pr" },
];

test("filter by track and query", () => {
  assert.equal(filterItems(items, { track: "junior-code", q: "wizard" }).length, 1);
  assert.equal(filterItems(items, { track: "junior-code" }).length, 2);
  assert.equal(filterItems(items, { status: "in-pr" })[0].id, "DE-035");
});

test("groupByLane buckets by status", () => {
  const g = groupByLane(items);
  assert.deepEqual(Object.keys(g), LANES);
  assert.equal(g.available[0].id, "DE-296");
  assert.equal(g["in-pr"][0].id, "DE-035");
});

test("searchCorpus matches substrings", () => {
  const entries = [{ kind: "de", ref: "DE-296", title: "DE-296: Tabular wizard", text: "extract" }];
  assert.equal(searchCorpus(entries, "wizard").length, 1);
  assert.equal(searchCorpus(entries, "nothing").length, 0);
});

test("claimUrl embeds DE id and picking-up framing", () => {
  const url = claimUrl(items[0], "LegalQuants/lq-ai");
  assert.match(url, /issues\/new/);
  assert.match(decodeURIComponent(url), /I'm picking up: DE-296/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/lib.test.mjs`
Expected: FAIL — `Cannot find module '../web/lib.mjs'`.

- [ ] **Step 3: Implement web/lib.mjs**

`web/lib.mjs`:
```js
export const LANES = ["available", "claimed", "in-pr", "done"];
const LANE_LABEL = { available: "Available", claimed: "Claimed", "in-pr": "In PR", done: "Done" };

export function filterItems(items, f = {}) {
  const q = (f.q || "").trim().toLowerCase();
  return items.filter((it) => {
    if (f.theme && f.theme !== "all" && it.theme !== f.theme) return false;
    if (f.track && f.track !== "all" && it.track !== f.track) return false;
    if (f.difficulty && f.difficulty !== "all" && it.difficulty !== f.difficulty) return false;
    if (f.status && f.status !== "all" && it.status !== f.status) return false;
    if (f.area && f.area !== "all" && !(it.area || []).includes(f.area)) return false;
    if (q) {
      const hay = [it.id, it.title, it.description, ...(it.skills || [])].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function groupByLane(items) {
  const g = Object.fromEntries(LANES.map((l) => [l, []]));
  for (const it of items) (g[it.status] || g.available).push(it);
  return g;
}

export function searchCorpus(entries, q) {
  const needle = (q || "").trim().toLowerCase();
  if (!needle) return [];
  return entries
    .map((e) => {
      const inTitle = e.title.toLowerCase().includes(needle);
      const inText = (e.text || "").toLowerCase().includes(needle);
      return inTitle || inText ? { e, rank: inTitle ? 0 : 1 } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank)
    .map((x) => x.e);
}

export function claimUrl(item, repo) {
  const title = encodeURIComponent(`I'm picking up: ${item.id} ${item.title}`);
  const body = encodeURIComponent(
    `I'd like to pick up **${item.id}** — ${item.title}.\n\n` +
      `Source: ${item.prdAnchor || "PRD §9"}\n\n` +
      `My rough approach (weigh in if you'd do it differently):\n- \n\n` +
      `_Filed from the Future Work Board._`
  );
  return `https://github.com/${repo}/issues/new?title=${title}&body=${body}`;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

export function itemCardHtml(item, repo) {
  const chips = [
    `<span class="chip status-${item.status}">${LANE_LABEL[item.status]}</span>`,
    `<span class="chip">${esc(item.theme)}</span>`,
    `<span class="chip">${esc(item.track)}</span>`,
    `<span class="chip">${esc(item.difficulty)}</span>`,
    ...(item.skills || []).map((s) => `<span class="chip">${esc(s)}</span>`),
  ].join("");
  const owner = item.owner ? `<span class="owner">@${esc(item.owner)}</span>` : "";
  const prdLink = item.prdAnchor ? `<a href="${esc(item.prdAnchor)}">PRD</a>` : "";
  const claim =
    item.status === "available"
      ? `<a class="button" href="${claimUrl(item, repo)}">I'm picking up this</a>`
      : "";
  const links = [...(item.links?.issues || []), ...(item.links?.prs || [])]
    .map((r) => `<a href="${esc(r.url)}">#${r.number}</a>`)
    .join(" ");
  return `<article class="card" data-id="${item.id}">
    <h3>${esc(item.id)}: ${esc(item.title)} ${owner}</h3>
    <p>${esc(item.description)}</p>
    <div class="chips">${chips}</div>
    <div class="card-links">${prdLink} ${links} ${claim}</div>
  </article>`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/lib.test.mjs`
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add web/lib.mjs test/lib.test.mjs
git commit -m "feat: pure frontend helpers for filter/group/search/render"
```

---

### Task 10: Static page shell + DOM wiring + live overlay

**Files:**
- Create: `docs/future-work/index.html`
- Create: `docs/future-work/app.js`
- Create: `docs/future-work/styles.css`
- Delete: `docs/future-work/future-work-data.js` (old inline seed), `scripts/generate-future-work.mjs` (superseded)
- Modify: copy `web/lib.mjs` → `docs/future-work/lib.mjs` at build/deploy (Task 11 handles copy; for local dev, symlink or copy once).

**Interfaces:**
- Consumes: `web/lib.mjs` exports; `future-work.json` + `search-index.json` in the same dir.
- Produces: rendered landing search, board with theme/track swimlane toggle, filters, and a client-side live overlay that refreshes claim status from `api.github.com`.

- [ ] **Step 1: Write index.html**

`docs/future-work/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>LQ AI — Future Work Board</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <header>
      <h1>LQ AI — Future Work Board</h1>
      <p id="subtitle">Live backlog of deferred enhancements you can claim.</p>
      <div id="stale" class="banner" hidden></div>
    </header>
    <main>
      <section class="search">
        <input id="corpusSearch" type="search" placeholder="Has this been built or asked before? Search all DEs, issues & PRs…" />
        <div id="searchResults" class="search-results" hidden></div>
      </section>

      <section class="metrics" id="metrics"></section>

      <section class="toolbar">
        <input id="q" type="search" placeholder="Filter the board…" />
        <select id="theme"></select>
        <select id="track"></select>
        <select id="difficulty"></select>
        <select id="status"></select>
        <div class="swimlane-toggle">
          <label><input type="radio" name="swim" value="none" checked /> Lanes</label>
          <label><input type="radio" name="swim" value="theme" /> by Theme</label>
          <label><input type="radio" name="swim" value="track" /> by Track</label>
        </div>
      </section>

      <section id="board" class="board"></section>
      <p id="footNote" class="note"></p>
    </main>
    <script type="module" src="./app.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Write app.js (DOM wiring + live overlay)**

`docs/future-work/app.js`:
```js
import { filterItems, groupByLane, searchCorpus, itemCardHtml, LANES } from "./lib.mjs";

const REPO = "LegalQuants/lq-ai";
const LANE_LABEL = { available: "Available", claimed: "Claimed", "in-pr": "In PR", done: "Done" };
let DATA = null;
let INDEX = [];

const $ = (id) => document.getElementById(id);

async function loadJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
}

function fillSelect(el, label, values) {
  const opts = ["all", ...[...new Set(values)].sort()];
  el.innerHTML = opts.map((v) => `<option value="${v}">${v === "all" ? `All ${label}` : v}</option>`).join("");
}

function currentFilters() {
  return { q: $("q").value, theme: $("theme").value, track: $("track").value,
    difficulty: $("difficulty").value, status: $("status").value };
}

function renderMetrics() {
  const c = DATA.meta.counts;
  $("metrics").innerHTML = [["total", "items"], ["available", "available"], ["claimed", "claimed"], ["in-pr", "in PR"], ["done", "done"]]
    .map(([k, lbl]) => `<div class="metric"><strong>${c[k] ?? 0}</strong><span>${lbl}</span></div>`)
    .join("");
}

function renderBoard() {
  const items = filterItems(DATA.items, currentFilters());
  const swim = document.querySelector('input[name="swim"]:checked').value;
  const board = $("board");

  if (swim === "none") {
    const g = groupByLane(items);
    board.className = "board lanes";
    board.innerHTML = LANES.map((lane) => `
      <div class="lane"><h2>${LANE_LABEL[lane]} <span>${g[lane].length}</span></h2>
      ${g[lane].map((it) => itemCardHtml(it, REPO)).join("") || '<p class="empty">—</p>'}</div>`).join("");
  } else {
    const groups = {};
    for (const it of items) (groups[it[swim]] ||= []).push(it);
    board.className = "board swim";
    board.innerHTML = Object.keys(groups).sort().map((key) => `
      <div class="swimgroup"><h2>${key} <span>${groups[key].length}</span></h2>
      <div class="swimrow">${groups[key].map((it) => itemCardHtml(it, REPO)).join("")}</div></div>`).join("")
      || '<p class="empty">No items match.</p>';
  }
}

function renderSearch() {
  const q = $("corpusSearch").value;
  const box = $("searchResults");
  if (!q.trim()) { box.hidden = true; return; }
  const hits = searchCorpus(INDEX, q).slice(0, 20);
  box.hidden = false;
  box.innerHTML = hits.length
    ? hits.map((e) => `<a class="hit ${e.kind}" href="${e.url || "#"}">
        <b>${e.title}</b><span class="hit-kind">${e.kind}${e.status ? " · " + e.status : ""}</span></a>`).join("")
    : '<p class="empty">Nothing found — looks new. You could be the first to file it.</p>';
}

// Client-side live overlay: refresh open issues/PRs so claims show up instantly.
async function liveOverlay() {
  try {
    const url = `https://api.github.com/repos/${REPO}/issues?state=open&per_page=100`;
    const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) return; // rate-limited or offline: keep baseline silently
    const raw = await res.json();
    const openByDe = new Map();
    for (const it of raw) {
      const isPr = Boolean(it.pull_request);
      for (const m of `${it.title} ${it.body || ""}`.matchAll(/\bDE-(\d{2,4})\b/g)) {
        const id = `DE-${m[1]}`;
        const prev = openByDe.get(id);
        openByDe.set(id, { status: isPr ? "in-pr" : (prev?.status === "in-pr" ? "in-pr" : "claimed"),
          owner: it.assignee?.login || it.user?.login });
      }
    }
    let changed = 0;
    for (const item of DATA.items) {
      const live = openByDe.get(item.id);
      if (live && item.status === "available") { item.status = live.status; item.owner = live.owner; changed += 1; }
    }
    if (changed) {
      DATA.meta.counts.available -= changed;
      renderMetrics();
      renderBoard();
      $("subtitle").textContent = `Live · ${changed} update(s) since last build.`;
    }
  } catch { /* offline: baseline stands */ }
}

async function main() {
  DATA = await loadJson("./future-work.json");
  INDEX = (await loadJson("./search-index.json").catch(() => ({ entries: [] }))).entries;

  fillSelect($("theme"), "themes", DATA.items.map((i) => i.theme));
  fillSelect($("track"), "tracks", DATA.items.map((i) => i.track));
  fillSelect($("difficulty"), "difficulty", DATA.items.map((i) => i.difficulty));
  fillSelect($("status"), "status", DATA.items.map((i) => i.status));

  renderMetrics();
  renderBoard();

  const stale = $("stale");
  if (DATA.meta.warnings?.length) { stale.hidden = false; stale.textContent = DATA.meta.warnings.join(" "); }
  $("footNote").innerHTML = `Built ${new Date(DATA.meta.generatedAt).toLocaleString()} · ` +
    `<a href="${DATA.meta.issuesUrl}">issues</a> · <a href="${DATA.meta.pullsUrl}">PRs</a> · ${DATA.meta.botPrCount} bot PRs hidden`;

  ["q", "theme", "track", "difficulty", "status"].forEach((id) => $(id).addEventListener("input", renderBoard));
  document.querySelectorAll('input[name="swim"]').forEach((r) => r.addEventListener("change", renderBoard));
  $("corpusSearch").addEventListener("input", renderSearch);

  liveOverlay(); // fire-and-forget
}

main();
```

- [ ] **Step 3: Write styles.css**

`docs/future-work/styles.css`:
```css
:root { color-scheme: light dark;
  --bg:#f7f8fb; --panel:#fff; --ink:#1e252f; --muted:#627083; --line:#d9e0ea;
  --blue:#2764c5; --green:#13795b; --amber:#9a6700; --violet:#6741d9; }
@media (prefers-color-scheme: dark){ :root{
  --bg:#0f141b; --panel:#161d27; --ink:#e6ebf2; --muted:#95a3b6; --line:#26313f; } }
*{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--ink);
  font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
a{color:var(--blue);text-decoration:none} a:hover{text-decoration:underline}
header{background:#202b3a;color:#fff;padding:22px 24px} h1{margin:0 0 4px;font-size:26px}
header p{margin:0;color:#d8e1ee}
.banner{margin-top:10px;background:#7a2018;color:#fff;padding:8px 10px;border-radius:6px}
main{max-width:1200px;margin:0 auto;padding:18px;display:grid;gap:16px}
.search input{width:100%;min-height:46px;font-size:16px;padding:10px 14px;border:1px solid var(--line);border-radius:10px;background:var(--panel);color:var(--ink)}
.search-results{margin-top:8px;background:var(--panel);border:1px solid var(--line);border-radius:10px;overflow:hidden}
.hit{display:flex;justify-content:space-between;gap:12px;padding:10px 14px;border-bottom:1px solid var(--line);color:var(--ink)}
.hit-kind{color:var(--muted);font-size:12px;text-transform:uppercase}
.metrics{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}
.metric{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:12px}
.metric strong{display:block;font-size:22px} .metric span{color:var(--muted)}
.toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.toolbar input,.toolbar select{min-height:38px;padding:8px 10px;border:1px solid var(--line);border-radius:6px;background:var(--panel);color:var(--ink)}
.toolbar #q{flex:1;min-width:200px}
.swimlane-toggle{display:flex;gap:10px;color:var(--muted)}
.board.lanes{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;align-items:start}
.lane{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px}
.lane h2,.swimgroup h2{font-size:14px;margin:2px 0 10px;display:flex;justify-content:space-between;color:var(--muted);text-transform:uppercase;letter-spacing:.03em}
.swimrow{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:12px;margin-bottom:10px}
.card h3{margin:0 0 6px;font-size:15px} .card p{margin:0 0 8px;color:var(--muted)}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
.chip{border:1px solid var(--line);border-radius:999px;padding:2px 8px;font-size:12px;color:var(--muted)}
.status-available{color:var(--green);border-color:var(--green)}
.status-claimed{color:var(--amber);border-color:var(--amber)}
.status-in-pr{color:var(--blue);border-color:var(--blue)}
.status-done{color:var(--muted)}
.owner{font-size:12px;color:var(--muted);font-weight:400}
.button{display:inline-block;border:1px solid var(--blue);color:var(--blue);border-radius:6px;padding:4px 10px}
.note,.empty{color:var(--muted)} .empty{padding:6px}
@media (max-width:860px){ .metrics{grid-template-columns:repeat(2,1fr)} .board.lanes{grid-template-columns:1fr} }
```

- [ ] **Step 4: Remove superseded files and wire lib for local dev**

```bash
rm -f docs/future-work/future-work-data.js scripts/generate-future-work.mjs
cp web/lib.mjs docs/future-work/lib.mjs
```

- [ ] **Step 5: Manual verification**

Run: `node src/build.mjs && (cd docs/future-work && python3 -m http.server 8000)`
Open `http://localhost:8000/`. Verify: metrics populate; board shows four lanes; theme/track swimlane toggle works; board filter + selects narrow results; corpus search returns DEs/issues/PRs and shows the "looks new" message for nonsense queries; an `available` card shows a working "I'm picking up this" link with a pre-filled title. (Live overlay may be rate-limited from a browser; confirm the page still renders from baseline JSON when it is.)

- [ ] **Step 6: Commit**

```bash
git add docs/future-work/index.html docs/future-work/app.js docs/future-work/styles.css docs/future-work/lib.mjs
git rm --cached docs/future-work/future-work-data.js scripts/generate-future-work.mjs 2>/dev/null || true
git commit -m "feat: search-first board UI with swimlanes and live claim overlay"
```

---

### Task 11: GitHub Action — build + Pages deploy

**Files:**
- Create: `.github/workflows/build.yml`
- Create: `docs/future-work/README.md` (how it works / how to run locally)

**Interfaces:**
- Produces: a workflow that on cron (~5 min), manual dispatch, and push to `main` runs the build, copies `web/lib.mjs` into the publish dir, and deploys `docs/future-work/` to GitHub Pages.

**Setup note (one-time, manual):** In repo Settings → Pages, set Source = "GitHub Actions". No secrets needed (`GITHUB_TOKEN` is automatic).

- [ ] **Step 1: Write the workflow**

`.github/workflows/build.yml`:
```yaml
name: Build Future Work Board
on:
  schedule:
    - cron: "*/10 * * * *"   # GitHub's floor is ~5-10 min; 10 is reliable
  workflow_dispatch: {}
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build-deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deploy.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: "npm" }
      - run: npm ci
      - run: npm test
      - name: Build data
        run: node src/build.mjs
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - name: Stage publish dir
        run: cp web/lib.mjs docs/future-work/lib.mjs
      - uses: actions/upload-pages-artifact@v3
        with: { path: docs/future-work }
      - id: deploy
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Write the README**

`docs/future-work/README.md`:
```markdown
# LQ AI — Future Work Board

A standalone, GitHub-Pages-published live board for the `LegalQuants/lq-ai`
deferred-enhancement (`DE-XXX`) backlog. See the design + plan in
`docs/superpowers/`.

- **Data:** rebuilt every ~10 min by `.github/workflows/build.yml` from the public
  PRD §9 + the lq-ai issues/PRs API. The page also does a client-side live overlay
  so newly-opened issues show as claimed instantly.
- **Claim status is deterministic:** an item is `claimed`/`in-pr`/`done` only when an
  issue or PR cites its `DE-XXX` id. Embeddings only suggest *related* items.
- **Run locally:** `npm ci && node src/build.mjs && (cd docs/future-work && python3 -m http.server 8000)`
- **Tests:** `npm test`.
```

- [ ] **Step 3: Verify workflow validity**

Run: `node -e "import('node:fs').then(fs=>console.log('yaml present:', fs.existsSync('.github/workflows/build.yml')))"`
Expected: `yaml present: true`. (Full validation happens on first push; ensure indentation is 2-space and keys match above.)

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/build.yml docs/future-work/README.md
git commit -m "ci: cron build + GitHub Pages deploy of the future work board"
```

- [ ] **Step 5: Push and enable Pages (manual, requires the remote)**

```bash
# git remote add origin git@github.com:<you>/visualize.git   # if not set
git push -u origin main
```
Then in GitHub → Settings → Pages → Source = "GitHub Actions". Trigger once via
Actions → "Build Future Work Board" → Run workflow. Confirm the published URL renders.

---

## Self-Review

**Spec coverage:**
- Req A (interactivity/filter by track & issue): Tasks 9–10 (`filterItems`, selects, swimlanes). ✓
- Req B (real-time claims): Task 8/11 cron baseline + Task 10 `liveOverlay`. ✓
- Req C (semantic matching without exact words): Tasks 6–7 (CI embeddings → `related`). ✓
- Req D (has this been built/asked before): Task 7 search index + Task 10 `renderSearch` over all DEs/issues/PRs incl. closed. ✓
- Four-lens clustering (theme/track/status/semantic): themes (Task 2), track (Task 3), status lanes (Tasks 5/9), semantic (Task 7). ✓
- Deterministic trunk / semantic net: Task 5 sets status; Task 7 explicitly never mutates status (tested). ✓
- Standalone in this repo → Pages: Task 11. ✓
- Closed/merged stay visible in Done + searchable: `statusFor` maps closed→done (Task 5); search index includes closed activity (Task 7). ✓
- Exclude dependabot: Task 4 `isBot`, counted in `meta.botPrCount`. ✓
- Degradation (§9 of spec): Task 8 warnings + fallbacks; Task 10 overlay silent-fail. ✓
- Claim template from houfu#1: Task 9 `claimUrl`. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code. The one deliberate reconciliation point (real PRD §9 markup) is an explicit verification step (Task 8 Step 6), not a placeholder.

**Type consistency:** Item/Activity/Ref shapes match across parser→tagger→linker→semantic→build→lib. `status` vocabulary and `LANES` identical in linker, lib, and app. `related` shape `{kind,ref,score}` consistent between semantic.mjs and its consumers. `searchIndex` entries `{kind,ref,title,text,status?,url?}` consistent between Task 7 and Task 10 `renderSearch`.

**Open items deferred to execution (from spec §12):** exact §9 subsection taxonomy is derived dynamically (no hardcode) and verified in Task 8 Step 6; similarity threshold defaults to 0.45 (tune during Task 8 real run); model fixed to `all-MiniLM-L6-v2`; Pages URL finalized in Task 11.
