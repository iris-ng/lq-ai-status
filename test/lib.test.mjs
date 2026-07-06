import { test } from "node:test";
import assert from "node:assert/strict";
import { filterItems, groupByLane, searchCorpus, claimUrl, itemCardHtml, LANES } from "../web/lib.mjs";

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

test("itemCardHtml escapes injection and handles a null owner + empty links", () => {
  const evil = {
    id: "DE-9", title: "<img src=x onerror=alert(1)>", description: "a & b < c",
    theme: "T", track: "junior-code", area: [], skills: [], difficulty: "small",
    status: "available", owner: null, links: {},
  };
  const html = itemCardHtml(evil, "o/r");
  assert.ok(!html.includes("<img src=x"), "raw script/img markup must be escaped");
  assert.ok(html.includes("&lt;img"), "angle brackets escaped");
  assert.ok(html.includes("a &amp; b &lt; c"), "ampersand and lt escaped");
  assert.ok(html.includes("status-available"), "status chip class present");
  assert.ok(!/\bnull\b/.test(html), "null owner not rendered literally");
});
