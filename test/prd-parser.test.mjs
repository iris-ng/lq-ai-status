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

test("parses heading-style DE items with categories as themes", () => {
  const md = [
    "## 9. Deferred Enhancements",
    "",
    "### Skill ecosystem expansions",
    "",
    "#### DE-001 — Additional starter skills",
    "",
    "- Context: broaden the M1 set",
    "- Acceptance criteria: five new skills",
    "",
    "#### DE-002 — Another skill",
    "",
    "### Security and compliance",
    "",
    "#### DE-100 — Tamper-evident audit log",
  ].join("\n");
  const { items: out, themes: th } = parsePrd(md, PRD_URL);
  assert.deepEqual(out.map((i) => i.id), ["DE-001", "DE-002", "DE-100"]);
  assert.deepEqual(th, ["Skill ecosystem expansions", "Security and compliance"]);
  const de001 = out.find((i) => i.id === "DE-001");
  assert.equal(de001.theme, "Skill ecosystem expansions");
  assert.equal(de001.title, "Additional starter skills");
  assert.match(de001.description, /broaden the M1 set/); // enriched from sub-bullets
});

test("meta headings and pre-category items fall under Uncategorised", () => {
  const md = [
    "## 9. Deferred Enhancements",
    "",
    "#### DE-500 — orphan before any category",
    "",
    "### How to add to this list",
    "",
    "#### DE-501 — appended item",
  ].join("\n");
  const { items: out, themes: th } = parsePrd(md, PRD_URL);
  assert.equal(out.find((i) => i.id === "DE-500").theme, "Uncategorised");
  assert.equal(out.find((i) => i.id === "DE-501").theme, "Uncategorised");
  assert.ok(th.includes("Uncategorised"));
  assert.ok(!th.includes("How to add to this list"));
});

test("does not duplicate items for mid-text cross-referenced DE-ids", () => {
  const md = [
    "## 9. Deferred Enhancements",
    "### Cat",
    "#### DE-050 — First",
    "- see also DE-051 and DE-999 for context",
    "#### DE-051 — Second",
  ].join("\n");
  const { items: out } = parsePrd(md, PRD_URL);
  assert.deepEqual(out.map((i) => i.id), ["DE-050", "DE-051"]);
});

test("parses a table-row DE item without pipe leakage", () => {
  const md = [
    "## 9. Deferred Enhancements",
    "",
    "### 9.9 Ops",
    "",
    "| ID | Enhancement |",
    "| --- | --- |",
    "| DE-410 | Structured logging rollout. |",
  ].join("\n");
  const { items: rows } = parsePrd(md, PRD_URL);
  const it = rows.find((i) => i.id === "DE-410");
  assert.ok(it, "DE-410 parsed from table row");
  assert.ok(!/\|/.test(it.title), "title has no leaked pipe");
  assert.ok(!/\|/.test(it.description), "description has no leaked pipe");
  assert.match(it.description, /Structured logging/);
});
