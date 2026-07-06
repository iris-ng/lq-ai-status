#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const prdPath = path.join(root, "docs", "PRD.md");
const outDir = path.join(root, "docs", "future-work");
const outPath = path.join(outDir, "future-work.json");

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "into",
  "is", "it", "of", "on", "or", "the", "to", "with", "work", "future", "deferred"
]);

const AREA_RULES = [
  ["web", ["ui", "ux", "frontend", "browser", "dashboard", "visual", "canvas", "mermaid"]],
  ["api", ["api", "endpoint", "fastapi", "schema", "request", "response"]],
  ["gateway", ["gateway", "proxy", "auth", "routing"]],
  ["ai", ["rag", "model", "prompt", "embedding", "llm", "extraction"]],
  ["infra", ["deploy", "docker", "ci", "github action", "redis", "observability"]],
  ["docs", ["docs", "prd", "documentation", "guide"]]
];

function slugId(index) {
  return `future-${String(index + 1).padStart(3, "0")}`;
}

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#./-]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function inferArea(text) {
  const lower = text.toLowerCase();
  const match = AREA_RULES.find(([, words]) => words.some((word) => lower.includes(word)));
  return match ? match[0] : "product";
}

function inferDifficulty(text) {
  const lower = text.toLowerCase();
  if (/(refactor|architecture|migration|multi-|pipeline|distributed|security|auth)/.test(lower)) return "large";
  if (/(integrate|support|workflow|endpoint|dashboard|automation|semantic)/.test(lower)) return "medium";
  return "small";
}

function inferImpact(text) {
  const lower = text.toLowerCase();
  if (/(security|user|workflow|claim|critical|reliability|visibility|dashboard)/.test(lower)) return "high";
  if (/(docs|labels|cleanup|dependency)/.test(lower)) return "medium";
  return "low";
}

function extractDeferredSection(markdown) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => /^#{1,3}\s*9\.\s*Deferred Enhancements/i.test(line));
  if (start === -1) return [];

  const startLevel = lines[start].match(/^#+/)?.[0].length || 2;
  const body = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const heading = lines[index].match(/^(#{1,6})\s+/);
    if (heading && heading[1].length <= startLevel) break;
    body.push(lines[index]);
  }
  return body;
}

function parseItems(lines) {
  const bullets = [];
  let current = null;

  for (const line of lines) {
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      if (current) bullets.push(current.trim());
      current = bullet[1];
      continue;
    }
    if (current && line.trim()) current += ` ${line.trim()}`;
  }
  if (current) bullets.push(current.trim());

  return bullets.map((text, index) => {
    const title = text.split(/[.:;]\s+/)[0].slice(0, 90);
    return {
      id: slugId(index),
      title,
      summary: text,
      area: inferArea(text),
      difficulty: inferDifficulty(text),
      impact: inferImpact(text),
      status: "available",
      owner: null,
      source: "docs/PRD.md#9",
      tags: tokenize(text).slice(0, 6),
      matches: []
    };
  });
}

function similarity(left, right) {
  const a = new Set(tokenize(left));
  const b = new Set(tokenize(right));
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  return intersection / Math.sqrt(a.size * b.size);
}

function attachMatches(items, records) {
  return items.map((item) => {
    const exact = records.find((record) => record.text.toLowerCase().includes(item.id));
    if (exact) {
      return {
        ...item,
        status: exact.type === "pull_request" ? "pr-open" : "claimed",
        owner: exact.author || null,
        matches: [{ ...exact, confidence: 1, reason: "Stable enhancement ID found." }]
      };
    }

    const candidates = records
      .map((record) => ({
        ...record,
        confidence: similarity(`${item.title} ${item.summary}`, record.text)
      }))
      .filter((record) => record.confidence >= 0.3)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3)
      .map((record) => ({
        ...record,
        reason: "Semantic candidate only. Requires maintainer confirmation before claim status changes."
      }));

    return {
      ...item,
      status: candidates.length ? "needs-review" : item.status,
      matches: candidates
    };
  });
}

async function main() {
  let items = [];
  try {
    const markdown = await readFile(prdPath, "utf8");
    items = parseItems(extractDeferredSection(markdown));
  } catch {
    items = [];
  }

  const data = {
    generatedAt: new Date().toISOString(),
    source: {
      prdUrl: "https://github.com/LegalQuants/lq-ai/blob/main/docs/PRD.md#9-deferred-enhancements-and-identified-future-work",
      issuesUrl: "https://github.com/LegalQuants/lq-ai/issues",
      pullsUrl: "https://github.com/LegalQuants/lq-ai/pulls",
      note: items.length
        ? "Generated from local docs/PRD.md. Add GitHub issue and PR JSON to attach live claim state in CI."
        : "No local docs/PRD.md section 9 was found. Keep the checked-in demo data or run this inside the lq-ai checkout."
    },
    github: {
      openIssueCount: 0,
      openPullRequestCount: 0,
      openPullRequests: []
    },
    items: attachMatches(items, [])
  };

  await mkdir(outDir, { recursive: true });
  await writeFile(outPath, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`Wrote ${outPath} with ${items.length} item(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
