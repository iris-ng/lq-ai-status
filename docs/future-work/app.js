import { filterItems, searchCorpus, itemCardHtml, esc } from "./lib.mjs";

const REPO = "LegalQuants/lq-ai";
const LANE_LABEL = { available: "Available", claimed: "Claimed", "in-pr": "In PR", done: "Done", open: "Open" };
let DATA = null;
let INDEX = [];

const $ = (id) => document.getElementById(id);

async function loadJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
}

function fillSelect(el, label, values) {
  const opts = ["all", ...[...new Set(values)].sort()];
  el.innerHTML = opts.map((v) => `<option value="${esc(v)}">${v === "all" ? `All ${esc(label)}` : esc(v)}</option>`).join("");
}

function currentFilters() {
  return { theme: $("theme").value, track: $("track").value,
    difficulty: $("difficulty").value, status: $("status").value };
}

// DE ids are assigned roughly in creation order, so the numeric id is our recency proxy.
const deNum = (it) => parseInt(String(it.id).replace(/^\D+/, ""), 10) || 0;

function renderBoard() {
  const items = filterItems(DATA.items, currentFilters());
  const dir = $("sort").value === "oldest" ? 1 : -1;
  items.sort((a, b) => (deNum(a) - deNum(b)) * dir);
  $("board").innerHTML = items.length
    ? items.map((it) => itemCardHtml(it, REPO)).join("")
    : '<p class="empty">No items match these filters.</p>';
}

function renderSearch() {
  const q = $("corpusSearch").value;
  const box = $("searchResults");
  if (!q.trim()) { box.hidden = true; return; }
  const all = searchCorpus(INDEX, q);
  const hits = all.slice(0, 50);
  box.hidden = false;
  if (!hits.length) {
    box.innerHTML = '<p class="empty">Nothing found — looks new. You could be the first to file it.</p>';
    return;
  }
  const rows = hits.map((e) => {
    const st = e.status || "open";
    return `<a class="hit" href="${esc(e.url || "#")}">
      <span class="hit-title">${esc(e.title)}</span>
      <span class="chip status-${esc(st)}">${esc(LANE_LABEL[st] || st)}</span>
    </a>`;
  }).join("");
  const more = all.length > hits.length
    ? `<p class="hit-more">Showing ${hits.length} of ${all.length} — refine your search to narrow.</p>`
    : "";
  box.innerHTML = rows + more;
}

// Client-side live overlay: refresh open issues/PRs so claims show up instantly.
async function liveOverlay() {
  try {
    const url = `https://api.github.com/repos/${REPO}/issues?state=open&per_page=100`;
    const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) return; // rate-limited or offline: keep baseline silently
    const raw = await res.json();
    const openByDe = new Map();
    for (const it of raw) {
      const isPr = Boolean(it.pull_request);
      for (const m of `${it.title} ${it.body || ""}`.matchAll(/\bDE-(\d{2,4})\b/g)) {
        const id = `DE-${m[1]}`;
        const prev = openByDe.get(id);
        openByDe.set(id, { status: isPr ? "in-pr" : (prev?.status === "in-pr" ? "in-pr" : "claimed"),
          owner: it.assignee?.login || it.user?.login });
      }
    }
    let changed = 0;
    for (const item of DATA.items) {
      const live = openByDe.get(item.id);
      if (live && item.status === "available") {
        item.status = live.status;
        item.owner = live.owner;
        changed += 1;
      }
    }
    if (changed) {
      renderBoard(); // lane counts recompute from item.status
      $("subtitle").textContent = `Live · ${changed} update(s) since last build.`;
    }
  } catch { /* offline: baseline stands */ }
}

function resetViews() {
  ["theme", "track", "difficulty", "status"].forEach((id) => { $(id).value = "all"; });
  $("sort").value = "latest";
  $("corpusSearch").value = "";
  renderSearch();
  renderBoard();
}

async function main() {
  try {
    DATA = await loadJson("./future-work.json");
  } catch (e) {
    const stale = $("stale");
    stale.hidden = false;
    stale.textContent = `Could not load board data (${e.message}). Try refreshing in a moment.`;
    return;
  }
  INDEX = (await loadJson("./search-index.json").catch(() => ({ entries: [] }))).entries;

  fillSelect($("theme"), "themes", DATA.items.map((i) => i.theme));
  fillSelect($("track"), "tracks", DATA.items.map((i) => i.track));
  fillSelect($("difficulty"), "difficulty", DATA.items.map((i) => i.difficulty));
  fillSelect($("status"), "status", DATA.items.map((i) => i.status));

  renderBoard();

  const stale = $("stale");
  if (DATA.meta.warnings?.length) { stale.hidden = false; stale.textContent = DATA.meta.warnings.join(" "); }
  $("footNote").innerHTML = `Built ${new Date(DATA.meta.generatedAt).toLocaleString()} · ` +
    `<a href="${DATA.meta.issuesUrl}">issues</a> · <a href="${DATA.meta.pullsUrl}">PRs</a> · ${DATA.meta.botPrCount} bot PRs hidden`;

  ["theme", "track", "difficulty", "status", "sort"].forEach((id) => $(id).addEventListener("input", renderBoard));
  $("corpusSearch").addEventListener("input", renderSearch);
  $("reset").addEventListener("click", resetViews);

  liveOverlay(); // fire-and-forget
}

main();
