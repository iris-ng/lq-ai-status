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

test("related is thresholded, sorted desc, and capped at 5", async () => {
  // score-encoded fake embedder: cosine([s,0],[1,0]) === s, so each item's marker sets its similarity to DE-T.
  const score = { T: 1, A: 0.9, B: 0.8, C: 0.7, D: 0.6, E: 0.5, F: 0.46, G: 0.44 };
  const scoreEmbed = async (text) => {
    const k = Object.keys(score).find((key) => text.includes(`<${key}>`));
    return [score[k] ?? 0, 0];
  };
  const many = Object.keys(score).map((k) => ({
    id: `DE-${k}`, title: `<${k}>`, description: "", theme: "x", track: "junior-code", status: "available", links: {},
  }));
  const { items: out } = await enrich({
    items: many, unlinked: [], activity: { issues: [], prs: [] }, embed: scoreEmbed, threshold: 0.45,
  });
  const target = out.find((i) => i.id === "DE-T");
  // Candidates ≥0.45 (excluding self): A,B,C,D,E,F = 6 → sorted desc, capped to top 5; G (0.44) excluded.
  assert.equal(target.related.length, 5);
  assert.deepEqual(target.related.map((r) => r.ref), ["DE-A", "DE-B", "DE-C", "DE-D", "DE-E"]);
  assert.ok(target.related.every((r) => r.score >= 0.45));
});
