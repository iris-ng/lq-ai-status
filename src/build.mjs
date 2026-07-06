import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parsePrd } from "./prd-parser.mjs";
import { tagItem, isGoodFirstIssue } from "./tagger.mjs";
import { fetchActivity } from "./github-fetch.mjs";
import { link } from "./linker.mjs";
import { enrich } from "./semantic.mjs";
import { llmTag } from "./llm-tagger.mjs";

const REPO = "LegalQuants/lq-ai";
const PRD_URL = "https://raw.githubusercontent.com/LegalQuants/lq-ai/main/docs/PRD.md";
const PRD_HTML = "https://github.com/LegalQuants/lq-ai/blob/main/docs/PRD.md";

export async function build(opts = {}) {
  const {
    prdMarkdown, prdUrl = PRD_HTML, repo = REPO, token = process.env.GITHUB_TOKEN,
    embed, outDir, now = new Date().toISOString(), fetchImpl = fetch,
    llmClient, llmCachePath,
  } = opts;
  const warnings = [];

  let markdown = prdMarkdown;
  if (!markdown) {
    try {
      const res = await fetchImpl(PRD_URL);
      if (!res.ok) throw new Error(`PRD fetch ${res.status}`);
      markdown = await res.text();
    } catch (e) {
      warnings.push(`Could not fetch PRD (${e.message}); used empty catalog.`);
      markdown = "";
    }
  }

  const { items: parsed, themes } = parsePrd(markdown, prdUrl);
  let items = parsed.map(tagItem);

  // Optional LLM tagging pass: overlays better track/area/skills/difficulty over the
  // keyword heuristic, which stays as the fallback. Runs only when a client is provided.
  let llmClassified = 0;
  if (llmClient) {
    try {
      const res = await llmTag(items, { client: llmClient, cachePath: llmCachePath });
      items = res.items;
      llmClassified = res.classified;
      if (res.failures) warnings.push(`LLM tagger left ${res.failures} item(s) on keyword tags (API errors).`);
    } catch (e) {
      warnings.push(`LLM tagging pass failed (${e.message}); using keyword tags.`);
    }
  }

  // Derived "good first issue" flag from the final (possibly LLM-upgraded) tags.
  items = items.map((it) => ({ ...it, goodFirstIssue: isGoodFirstIssue(it) }));

  let activity = { issues: [], prs: [], botCount: 0 };
  try { activity = await fetchActivity({ repo, token, fetchImpl }); }
  catch (e) { warnings.push(`Could not fetch activity (${e.message}); showing catalog only.`); }
  if (activity.truncated) warnings.push("GitHub activity was truncated at the page cap; some items may be missing.");

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
  counts.goodFirstIssues = items.filter((i) => i.goodFirstIssue).length;

  const data = {
    meta: {
      generatedAt: now, repo, prdUrl,
      issuesUrl: `https://github.com/${repo}/issues`,
      pullsUrl: `https://github.com/${repo}/pulls`,
      botPrCount: activity.botCount, counts, themes, warnings, llmClassified,
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
  let llmClient;
  if (process.env.ANTHROPIC_API_KEY) {
    const { makeClient } = await import("./llm-tagger.mjs");
    llmClient = await makeClient();
  }
  const data = await build({ embed, outDir: "docs/future-work", llmClient, llmCachePath: "llm-tag-cache.json" });
  console.log(`Built ${data.items.length} items; LLM-classified ${data.meta.llmClassified}; warnings: ${data.meta.warnings.length}`);
}
