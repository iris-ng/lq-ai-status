import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

// Cheap, fast classification model. The user opted into Haiku for this pass.
const MODEL = "claude-haiku-4-5";
const BATCH = 20;

const TRACKS = ["self-hosting-docs", "junior-code", "docs-quality", "legal-domain"];
const DIFFICULTIES = ["small", "medium", "large"];
const AREAS = ["web", "api", "gateway", "ai", "infra", "docs", "legal", "product"];
const SKILLS = ["react", "python", "devops", "legal-research", "writing", "docs"];

// Structured output forces the model to return only valid enum values.
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["tags"],
  properties: {
    tags: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "track", "difficulty", "area", "skills"],
        properties: {
          id: { type: "string" },
          track: { type: "string", enum: TRACKS },
          difficulty: { type: "string", enum: DIFFICULTIES },
          area: { type: "array", items: { type: "string", enum: AREAS } },
          skills: { type: "array", items: { type: "string", enum: SKILLS } },
        },
      },
    },
  },
};

const PROMPT_HEADER = `You are triaging a software project's backlog. For each item, assign:
- track: who should pick it up — legal-domain (needs legal/regulatory expertise), self-hosting-docs (deployment/infra/ops), docs-quality (documentation & writing), or junior-code (general app/code work).
- difficulty: small (hours), medium (a day or two), or large (multi-day / architectural / risky).
- area: any of web, api, gateway, ai, infra, docs, legal, product (choose all that apply; use product if nothing else fits).
- skills: any of react, python, devops, legal-research, writing, docs (choose all that apply; may be empty).
Return one entry per item id. Items:\n\n`;

function hashItem(item) {
  return createHash("sha256").update(`${item.title}\n${item.description}`).digest("hex").slice(0, 16);
}

export async function makeClient() {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  return new Anthropic(); // resolves ANTHROPIC_API_KEY (or an ant profile) from the environment
}

async function classifyBatch(client, model, batch) {
  const list = batch
    .map((b) => `${b.id}: ${b.title} — ${b.description}`.slice(0, 400))
    .join("\n");
  const res = await client.messages.create({
    model,
    max_tokens: 4096,
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: `${PROMPT_HEADER}${list}` }],
  });
  const text = res.content.find((b) => b.type === "text")?.text ?? "{}";
  return JSON.parse(text).tags || [];
}

/**
 * Overlay LLM-inferred track/area/skills/difficulty onto already-keyword-tagged items.
 * Items the LLM doesn't classify (cache miss + API error) keep their keyword tags — the
 * keyword tagger is the fallback. A content-hash cache means unchanged items aren't re-billed.
 */
export async function llmTag(items, { client, model = MODEL, cachePath, batchSize = BATCH } = {}) {
  let cache = {};
  if (cachePath) {
    try { cache = JSON.parse(await readFile(cachePath, "utf8")); } catch { cache = {}; }
  }

  const results = new Map();
  const toTag = [];
  for (const it of items) {
    const h = hashItem(it);
    const hit = cache[it.id];
    if (hit && hit.hash === h) results.set(it.id, hit.tags);
    else toTag.push({ item: it, hash: h });
  }

  let failures = 0;
  for (let i = 0; i < toTag.length; i += batchSize) {
    const slice = toTag.slice(i, i + batchSize);
    try {
      const tags = await classifyBatch(client, model, slice.map((s) => s.item));
      const byId = new Map(tags.map((t) => [t.id, t]));
      for (const { item, hash } of slice) {
        const t = byId.get(item.id);
        if (!t) continue;
        const clean = { track: t.track, difficulty: t.difficulty, area: t.area, skills: t.skills };
        results.set(item.id, clean);
        cache[item.id] = { hash, tags: clean };
      }
    } catch {
      failures += slice.length; // leave these items on their keyword tags
    }
  }

  if (cachePath) {
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
  }

  const tagged = items.map((it) => {
    const t = results.get(it.id);
    return t ? { ...it, ...t } : it;
  });
  return { items: tagged, classified: results.size, failures };
}
