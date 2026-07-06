import { test } from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { llmTag } from "../src/llm-tagger.mjs";

const base = () => [
  { id: "DE-1", title: "Bedrock adapter", description: "gateway provider", track: "Uncategorised", difficulty: "Uncategorised", area: ["product"], skills: [] },
  { id: "DE-2", title: "GDPR graph", description: "legal", track: "Uncategorised", difficulty: "Uncategorised", area: ["product"], skills: [] },
];

function fakeClient(map, counter) {
  return {
    messages: {
      create: async () => {
        if (counter) counter.calls += 1;
        const tags = Object.entries(map).map(([id, t]) => ({ id, ...t }));
        return { content: [{ type: "text", text: JSON.stringify({ tags }) }] };
      },
    },
  };
}

test("overlays LLM tags onto keyword-tagged items", async () => {
  const client = fakeClient({
    "DE-1": { track: "self-hosting-docs", difficulty: "medium", area: ["gateway"], skills: ["devops"] },
    "DE-2": { track: "legal-domain", difficulty: "large", area: ["legal"], skills: ["legal-research"] },
  });
  const { items: out, classified } = await llmTag(base(), { client });
  assert.equal(classified, 2);
  assert.equal(out.find((i) => i.id === "DE-1").track, "self-hosting-docs");
  assert.equal(out.find((i) => i.id === "DE-2").difficulty, "large");
});

test("falls back to keyword tags when the API errors", async () => {
  const client = { messages: { create: async () => { throw new Error("boom"); } } };
  const { items: out, failures } = await llmTag(base(), { client });
  assert.equal(failures, 2);
  assert.equal(out[0].track, "Uncategorised"); // keyword tag preserved
  assert.equal(out[0].difficulty, "Uncategorised");
});

test("content-hash cache skips re-classification of unchanged items", async () => {
  const cachePath = join(tmpdir(), `llmtag-${process.pid}.json`);
  const counter = { calls: 0 };
  const client = fakeClient({
    "DE-1": { track: "junior-code", difficulty: "small", area: ["api"], skills: ["python"] },
    "DE-2": { track: "legal-domain", difficulty: "large", area: ["legal"], skills: ["legal-research"] },
  }, counter);
  await llmTag(base(), { client, cachePath });
  const afterFirst = counter.calls;
  assert.ok(afterFirst >= 1);
  await llmTag(base(), { client, cachePath }); // all cached -> no new calls
  assert.equal(counter.calls, afterFirst);
  await rm(cachePath, { force: true });
});
