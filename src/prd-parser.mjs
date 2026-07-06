const DE_RE = /\bDE-(\d{2,4})\b/;

function slug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Strip a leading DE id + markdown emphasis/punctuation from bullet/row.
function stripLead(text) {
  return text
    .replace(/^\s*[-*]\s+/, "")
    .replace(/^\|/, "")
    .replace(/\*\*/g, "")
    .replace(new RegExp(`^\\s*${DE_RE.source}\\s*[:|—–-]?\\s*`), "")
    .replace(/\s*\|\s*$/, "") // drop a trailing table-cell pipe
    .trim();
}

export function parsePrd(markdown, prdUrl) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((l) => /^#{1,3}\s*9\.\s*Deferred Enhancements/i.test(l));
  if (start === -1) return { items: [], themes: [] };

  const startLevel = lines[start].match(/^#+/)[0].length;
  const items = [];
  const themes = [];
  let theme = "General";

  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      if (heading[1].length <= startLevel) break;
      theme = heading[2].replace(/^\d+(\.\d+)*\s*/, "").trim();
      if (!themes.includes(theme)) themes.push(theme);
      continue;
    }

    const m = line.match(DE_RE);
    if (!m) continue;

    const id = `DE-${m[1]}`;
    const rest = stripLead(line);
    const title = rest.split(/\s+[—–-]\s+|[.:;]\s+/)[0].slice(0, 90).trim();

    items.push({
      id,
      title: title || id,
      description: rest,
      theme,
      prdAnchor: `${prdUrl}#${slug(theme)}`,
    });
  }

  return { items, themes };
}
