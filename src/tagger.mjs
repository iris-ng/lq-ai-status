const AREA_RULES = [
  ["web", ["ui", "ux", "frontend", "dashboard", "react", "vite", "canvas", "mermaid"]],
  ["api", ["api", "endpoint", "fastapi", "schema", "langgraph"]],
  ["gateway", ["gateway", "proxy", "provider", "bedrock", "routing"]],
  ["ai", ["rag", "model", "prompt", "embedding", "llm", "agent", "extraction"]],
  ["infra", ["deploy", "docker", "caddy", "tailscale", "ci", "redis", "observability"]],
  ["docs", ["docs", "documentation", "guide", "readme"]],
];

const SKILL_RULES = [
  ["react", ["react", "frontend", "vite"]],
  ["python", ["fastapi", "langgraph", "python", "api", "gateway"]],
  ["devops", ["docker", "caddy", "ci", "deploy", "tailscale"]],
  ["legal-research", ["gdpr", "trademark", "statute", "citation", "bluebook", "court"]],
  ["writing", ["docs", "documentation", "guide", "readme"]],
];

const UNCATEGORISED = "Uncategorised";

// Whole-word (plural-tolerant) match so short keywords like "ci" don't match
// inside unrelated words ("citation", "specific", "decision", …).
function matched(text, rules) {
  return rules
    .filter(([, words]) => words.some((w) => new RegExp(`\\b${w}s?\\b`).test(text)))
    .map(([name]) => name);
}

function inferTrack(area, skills) {
  if (skills.includes("legal-research")) return "legal-domain";
  if (area.includes("infra") || area.includes("docs")) {
    return area.includes("docs") && !area.includes("infra") ? "docs-quality" : "self-hosting-docs";
  }
  return UNCATEGORISED; // no positive track signal — don't pretend it's junior-code
}

function inferDifficulty(text) {
  if (/\b(refactor|architecture|migration|multi-|pipeline|distributed|security|autonomous)/.test(text)) return "large";
  if (/\b(integrate|support|workflow|endpoint|dashboard|adapter|semantic)/.test(text)) return "medium";
  return UNCATEGORISED; // no size keyword fired — unsized, not silently "small"
}

export function tagItem(item) {
  const text = `${item.title} ${item.description}`.toLowerCase();
  const area = matched(text, AREA_RULES);
  const skills = matched(text, SKILL_RULES);

  return {
    ...item,
    area: area.length ? area : ["product"],
    skills,
    track: inferTrack(area, skills),
    difficulty: inferDifficulty(text),
  };
}
