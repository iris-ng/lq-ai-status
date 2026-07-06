export const LANES = ["available", "claimed", "in-pr", "done"];
const LANE_LABEL = { available: "Available", claimed: "Claimed", "in-pr": "In PR", done: "Done" };

export function filterItems(items, f = {}) {
  const q = (f.q || "").trim().toLowerCase();
  return items.filter((it) => {
    if (f.theme && f.theme !== "all" && it.theme !== f.theme) return false;
    if (f.track && f.track !== "all" && it.track !== f.track) return false;
    if (f.difficulty && f.difficulty !== "all" && it.difficulty !== f.difficulty) return false;
    if (f.status && f.status !== "all" && it.status !== f.status) return false;
    if (f.area && f.area !== "all" && !(it.area || []).includes(f.area)) return false;
    if (f.gfi && !it.goodFirstIssue) return false;
    if (q) {
      const hay = [it.id, it.title, it.description, ...(it.skills || [])].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function groupByLane(items) {
  const g = Object.fromEntries(LANES.map((l) => [l, []]));
  for (const it of items) (g[it.status] || g.available).push(it);
  return g;
}

export function searchCorpus(entries, q) {
  const needle = (q || "").trim().toLowerCase();
  if (!needle) return [];
  return entries
    .map((e) => {
      const inTitle = e.title.toLowerCase().includes(needle);
      const inText = (e.text || "").toLowerCase().includes(needle);
      return inTitle || inText ? { e, rank: inTitle ? 0 : 1 } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank)
    .map((x) => x.e);
}

// Opens lq-ai's own feature-request issue form (house style), pre-filling the
// DE reference and scaffolding each section. Per CONTRIBUTING, claiming a DE means
// filing an issue that references the PRD §9 DE-### entry before starting work.
export function claimUrl(item, repo) {
  const de = item.id;
  const params = new URLSearchParams({
    template: "feature-request.yml",
    title: `[Feature] ${de} — ${item.title}`,
    "de-reference": de,
    "use-case":
      `Claiming **${de} — ${item.title}** from PRD §9.\n\n` +
      `Context: ${item.description}\n\n` +
      `(Describe the specific user problem this solves and who benefits.)`,
    "current-state": "(How is this handled today, and why is that insufficient?)",
    "proposed-approach": `(Your rough approach — maintainers confirm before you start. Refs ${de}.)\n- `,
    "additional-context": "Filed from the LQ-AI Work Pipeline.",
  });
  return `https://github.com/${repo}/issues/new?${params.toString()}`;
}

export function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

export function itemCardHtml(item, repo) {
  const owner = item.owner ? `<span class="owner">@${esc(item.owner)}</span>` : "";
  // Row 2: availability, PRD, linked issues/PRs, and the claim CTA.
  const statusChip = `<span class="chip status-${esc(item.status)}">${LANE_LABEL[item.status] || esc(item.status)}</span>`;
  const prdLink = item.prdAnchor ? `<a class="button ghost" href="${esc(item.prdAnchor)}">PRD</a>` : "";
  const refs = [...(item.links?.issues || []), ...(item.links?.prs || [])]
    .map((r) => `<a class="button ghost" href="${esc(r.url)}">#${r.number}</a>`)
    .join("");
  const claim =
    item.status === "available"
      ? `<a class="button" href="${esc(claimUrl(item, repo))}">I'm claiming this</a>`
      : "";
  // Row 3: indicator bubbles.
  const chips = [
    item.goodFirstIssue ? `<span class="chip gfi">good first issue</span>` : "",
    `<span class="chip">${esc(item.theme)}</span>`,
    `<span class="chip">${esc(item.track)}</span>`,
    `<span class="chip">${esc(item.difficulty)}</span>`,
    ...(item.skills || []).map((s) => `<span class="chip">${esc(s)}</span>`),
  ].join("");
  // Semantic neighbours (requirement C): DE-ids scroll on the page; issues/PRs link out.
  const related = (item.related || []).length
    ? `<div class="related">Related: ${item.related
        .map((r) =>
          r.kind === "de"
            ? `<a class="chip" href="#${esc(r.ref)}">${esc(r.ref)}</a>`
            : `<a class="chip" href="https://github.com/${repo}/issues/${encodeURIComponent(r.ref)}">#${esc(r.ref)}</a>`
        )
        .join(" ")}</div>`
    : "";
  return `<article class="card" id="${esc(item.id)}" data-id="${esc(item.id)}">
    <h3>${esc(item.id)}: ${esc(item.title)} ${owner}</h3>
    <div class="card-actions">${statusChip}${prdLink}${refs}${claim}</div>
    <div class="chips">${chips}</div>
    ${related}
    <p>${esc(item.description)}</p>
  </article>`;
}
