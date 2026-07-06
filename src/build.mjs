import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parsePrd } from "./prd-parser.mjs";
import { tagItem } from "./tagger.mjs";
import { fetchActivity } from "./github-fetch.mjs";
import { link } from "./linker.mjs";
import { enrich } from "./semantic.mjs";

const REPO = "LegalQuants/lq-ai";
const PRD_URL = "https://raw.githubusercontent.com/LegalQuants/lq-ai/main/docs/PRD.md";
const PRD_HTML = "https://github.com/LegalQuants/lq-ai/blob/main/docs/PRD.md";

export async function build(opts = {}) {
  const {
    prdMarkdown, prdUrl = PRD_HTML, repo = REPO, token = process.env.GITHUB_TOKEN,
    embed, outDir, now = new Date().toISOString(), fetchImpl = fetch,
  } = opts;
  const warnings = [];

  let markdown = prdMarkdown;
  if (!markdown) {
    try { markdown = await (await fetchImpl(PRD_URL)).text(); }
    catch { warnings.push("Could not fetch PRD; used empty catalog."); markdown = ""; }
  }

  const { items: parsed, themes } = parsePrd(markdown, prdUrl);
  let items = parsed.map(tagItem);

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

  const data = {
    meta: {
      generatedAt: now, repo, prdUrl,
      issuesUrl: `https://github.com/${repo}/issues`,
      pullsUrl: `https://github.com/${repo}/pulls`,
      botPrCount: activity.botCount, counts, themes, warnings,
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
  const data = await build({ embed, outDir: "docs/future-work" });
  console.log(`Built ${data.items.length} items; warnings: ${data.meta.warnings.length}`);
}
