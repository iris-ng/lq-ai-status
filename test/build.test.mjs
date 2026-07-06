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
