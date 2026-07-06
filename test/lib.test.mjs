import { test } from "node:test";
import assert from "node:assert/strict";
import { filterItems, groupByLane, searchCorpus, claimUrl, itemCardHtml, esc, LANES } from "../web/lib.mjs";

const items = [
  { id: "DE-296", title: "Tabular wizard", description: "extract", skills: ["python"], theme: "Workflow intelligence", track: "app-code", area: ["web"], difficulty: "medium", status: "available" },
  { id: "DE-035", title: "Bedrock adapter", description: "gateway", skills: ["python"], theme: "Security and compliance", track: "app-code", area: ["gateway"], difficulty: "large", status: "in-pr" },
];

test("filter by track and query", () => {
  assert.equal(filterItems(items, { track: "app-code", q: "wizard" }).length, 1);
  assert.equal(filterItems(items, { track: "app-code" }).length, 2);
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

test("claimUrl opens the house-style feature-request form referencing the DE", () => {
  const url = claimUrl(items[0], "LegalQuants/lq-ai");
  assert.match(url, /\/LegalQuants\/lq-ai\/issues\/new\?/);
  assert.match(url, /template=feature-request\.yml/);
  assert.match(url, /de-reference=DE-296/);
  const decoded = decodeURIComponent(url.replace(/\+/g, " "));
  assert.match(decoded, /title=\[Feature\] DE-296 — Tabular wizard/);
  assert.match(decoded, /Claiming \*\*DE-296 — Tabular wizard\*\* from PRD §9/);
});

test("filterItems constrains by theme and treats 'all'/'' as no-constraint", () => {
  assert.equal(filterItems(items, { theme: "Workflow intelligence" }).length, 1);
  assert.equal(filterItems(items, { theme: "all", track: "all", q: "" }).length, 2);
  assert.equal(filterItems(items, { area: "gateway" })[0].id, "DE-035");
  assert.equal(filterItems(items, { difficulty: "large" })[0].id, "DE-035");
});

test("searchCorpus ranks title matches before body-only matches", () => {
  const entries = [
    { kind: "de", ref: "DE-1", title: "Nothing here", text: "mentions bedrock in body" },
    { kind: "de", ref: "DE-2", title: "Bedrock adapter", text: "unrelated" },
  ];
  const hits = searchCorpus(entries, "bedrock");
  assert.deepEqual(hits.map((h) => h.ref), ["DE-2", "DE-1"]); // title match first
  assert.equal(searchCorpus(entries, "").length, 0);
});

test("itemCardHtml surfaces semantic related neighbours", () => {
  const it = {
    id: "DE-9", title: "t", description: "d", theme: "T", track: "app-code",
    area: [], skills: [], difficulty: "small", status: "available", owner: null, links: {},
    related: [{ kind: "de", ref: "DE-201", score: 0.7 }, { kind: "pr", ref: 265, score: 0.6 }],
  };
  const html = itemCardHtml(it, "o/r");
  assert.match(html, /Related:/);
  assert.match(html, /href="#DE-201"/);
  assert.match(html, /github\.com\/o\/r\/issues\/265/);
});

test("esc escapes HTML-significant characters (used by app.js on live GitHub titles)", () => {
  assert.equal(esc('<img src=x onerror="a">& b'), "&lt;img src=x onerror=&quot;a&quot;&gt;&amp; b");
});

test("itemCardHtml escapes injection and handles a null owner + empty links", () => {
  const evil = {
    id: "DE-9", title: "<img src=x onerror=alert(1)>", description: "a & b < c",
    theme: "T", track: "app-code", area: [], skills: [], difficulty: "small",
    status: "available", owner: null, links: {},
  };
  const html = itemCardHtml(evil, "o/r");
  assert.ok(!html.includes("<img src=x"), "raw script/img markup must be escaped");
  assert.ok(html.includes("&lt;img"), "angle brackets escaped");
  assert.ok(html.includes("a &amp; b &lt; c"), "ampersand and lt escaped");
  assert.ok(html.includes("status-available"), "status chip class present");
  assert.ok(!/\bnull\b/.test(html), "null owner not rendered literally");
});

test("filterItems gfi flag narrows to good-first-issue items", () => {
  const list = [
    { id: "DE-1", track: "app-code", difficulty: "small", status: "available", area: [], skills: [], theme: "x", goodFirstIssue: true },
    { id: "DE-2", track: "app-code", difficulty: "large", status: "available", area: [], skills: [], theme: "x", goodFirstIssue: false },
  ];
  assert.equal(filterItems(list, { gfi: true }).length, 1);
  assert.equal(filterItems(list, { gfi: true })[0].id, "DE-1");
  assert.equal(filterItems(list, {}).length, 2);
});

test("itemCardHtml shows a good-first-issue badge only when flagged", () => {
  const it = { id: "DE-9", title: "t", description: "d", theme: "T", track: "app-code", area: [], skills: [], difficulty: "small", status: "available", owner: null, links: {}, goodFirstIssue: true };
  assert.match(itemCardHtml(it, "o/r"), /chip gfi">good first issue</);
  assert.ok(!itemCardHtml({ ...it, goodFirstIssue: false }, "o/r").includes("good first issue"));
});
