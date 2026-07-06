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

test("area falls back to product when nothing matches", () => {
  const t = tagItem({ id: "DE-5", title: "Rename a label", description: "tidy up wording", theme: "x" });
  assert.deepEqual(t.area, ["product"]);
});

test("docs-quality track for docs without infra", () => {
  const t = tagItem({ id: "DE-6", title: "Contributor documentation guide", description: "improve the readme", theme: "x" });
  assert.equal(t.track, "docs-quality");
});

test("track is Uncategorised when no positive signal matches", () => {
  const t = tagItem({ id: "DE-7", title: "Add an API endpoint", description: "fastapi handler", theme: "x" });
  assert.equal(t.track, "Uncategorised");
});

test("difficulty is Uncategorised when no size keyword fires", () => {
  const t = tagItem({ id: "DE-8", title: "Rename a label", description: "tidy up wording", theme: "x" });
  assert.equal(t.difficulty, "Uncategorised");
});

test("whole-word matching: 'citation' is not mis-tagged as infra via the 'ci' keyword", () => {
  const t = tagItem({ id: "DE-9", title: "Case citation validation", description: "specific decision policies", theme: "x" });
  assert.ok(!t.area.includes("infra"));
  assert.equal(t.track, "legal-domain"); // 'citation' is a legal-research skill keyword
});
