import { test } from "node:test";
import assert from "node:assert/strict";
import { cosine } from "../src/embed.mjs";

test("cosine of identical vectors is 1", () => {
  assert.equal(cosine([1, 0, 0], [1, 0, 0]), 1);
});

test("cosine of orthogonal vectors is 0", () => {
  assert.equal(cosine([1, 0], [0, 1]), 0);
});
