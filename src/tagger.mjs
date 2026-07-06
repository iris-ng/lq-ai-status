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

function matched(text, rules) {
  return rules.filter(([, words]) => words.some((w) => text.includes(w))).map(([name]) => name);
}

function inferTrack(text, area, skills) {
  if (skills.includes("legal-research")) return "legal-domain";
  if (area.includes("infra") || area.includes("docs")) {
    return area.includes("docs") && !area.includes("infra") ? "docs-quality" : "self-hosting-docs";
  }
  return "junior-code";
}

function inferDifficulty(text) {
  if (/(refactor|architecture|migration|multi-|pipeline|distributed|security|autonomous)/.test(text)) return "large";
  if (/(integrate|support|workflow|endpoint|dashboard|adapter|semantic)/.test(text)) return "medium";
  return "small";
}

export function tagItem(item) {
  const text = `${item.title} ${item.description}`.toLowerCase();
  const area = matched(text, AREA_RULES);
  const skills = matched(text, SKILL_RULES);

  return {
    ...item,
    area: area.length ? area : ["product"],
    skills,
    track: inferTrack(text, area, skills),
    difficulty: inferDifficulty(text),
  };
}
