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
