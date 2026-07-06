const DE_RE = /\bDE-(\d{2,4})\b/;
// A DE id at the very start of a heading's text, e.g. "#### DE-001 — Title".
// (Assumes the id is the first token; the live PRD always leads its DE headings this way.)
const HEADING_ID = /^DE-(\d{2,4})\b/;
// A DE id declaring a bullet/table-row item, e.g. "- **DE-296**: …" or "| DE-410 | …".
// Requires a separator (:—–-|) right after the id so a bolded inline cross-reference
// like "- **DE-101** already covered" is treated as prose, not a new item.
const BULLET_ID = /^\s*[-*|]\s*(?:\*\*)?\s*DE-(\d{2,4})\b(?:\*\*)?\s*[:—–|-]/;
const DESC_CAP = 400;

function slug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Strip a leading DE id + markdown emphasis/table punctuation from a heading, bullet, or row.
function stripLead(text) {
  return text
    .replace(/^\s*[-*]\s+/, "")
    .replace(/^\|/, "")
    .replace(/\*\*/g, "")
    .replace(new RegExp(`^\\s*${DE_RE.source}\\s*[:|—–-]?\\s*`), "")
    .replace(/\s*\|\s*$/, "") // drop a trailing table-cell pipe
    .trim();
}

function titleOf(rest, id) {
  const title = (rest.split(/\s+[—–-]\s+|[.:;]\s+/)[0] || rest).slice(0, 90).trim();
  return title || id;
}

export function parsePrd(markdown, prdUrl) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((l) => /^#{1,3}\s*9\.\s*Deferred Enhancements/i.test(l));
  if (start === -1) return { items: [], themes: [] };

  const startLevel = lines[start].match(/^#+/)[0].length;
  const items = [];
  const themes = [];
  const byId = new Map();
  let theme = "General";
  let current = null;

  // Create an item once per id; a second sighting (e.g. a cross-reference) just re-focuses it.
  const addItem = (id, rest, anchorSource) => {
    if (byId.has(id)) {
      current = byId.get(id);
      return;
    }
    const item = {
      id,
      title: titleOf(rest, id),
      description: rest || id,
      theme,
      prdAnchor: `${prdUrl}#${slug(anchorSource)}`,
    };
    byId.set(id, item);
    items.push(item);
    current = item;
  };

  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      if (heading[1].length <= startLevel) break; // left section 9
      const text = heading[2].trim();
      const hm = text.match(HEADING_ID);
      if (hm) {
        addItem(`DE-${hm[1]}`, stripLead(text), text);
      } else {
        current = null;
        theme = text.replace(/^\d+(\.\d+)*\s*/, "").trim();
        if (!themes.includes(theme)) themes.push(theme);
      }
      continue;
    }

    const bm = line.match(BULLET_ID);
    if (bm) {
      addItem(`DE-${bm[1]}`, stripLead(line), stripLead(line));
      continue;
    }

    // Non-structural line: enrich the current item's description (for search), capped.
    if (current && line.trim() && current.description.length < DESC_CAP) {
      const extra = line.replace(/^\s*[-*]\s+/, "").replace(/\*\*/g, "").trim();
      if (extra) current.description = `${current.description} ${extra}`.slice(0, DESC_CAP);
    }
  }

  return { items, themes };
}
