import { filterItems, groupByLane, searchCorpus, itemCardHtml, esc, LANES } from "./lib.mjs";

const REPO = "LegalQuants/lq-ai";
const LANE_LABEL = { available: "Available", claimed: "Claimed", "in-pr": "In PR", done: "Done" };
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
  return { q: $("q").value, theme: $("theme").value, track: $("track").value,
    difficulty: $("difficulty").value, status: $("status").value };
}

function renderMetrics() {
  const c = DATA.meta.counts;
  $("metrics").innerHTML = [["total", "items"], ["available", "available"], ["claimed", "claimed"], ["in-pr", "in PR"], ["done", "done"]]
    .map(([k, lbl]) => `<div class="metric"><strong>${c[k] ?? 0}</strong><span>${lbl}</span></div>`)
    .join("");
}

function renderBoard() {
  const items = filterItems(DATA.items, currentFilters());
  const swim = document.querySelector('input[name="swim"]:checked').value;
  const board = $("board");

  if (swim === "none") {
    const g = groupByLane(items);
    board.className = "board lanes";
    board.innerHTML = LANES.map((lane) => `
      <div class="lane"><h2>${LANE_LABEL[lane]} <span>${g[lane].length}</span></h2>
      ${g[lane].map((it) => itemCardHtml(it, REPO)).join("") || '<p class="empty">—</p>'}</div>`).join("");
  } else {
    const groups = {};
    for (const it of items) (groups[it[swim]] ||= []).push(it);
    board.className = "board swim";
    board.innerHTML = Object.keys(groups).sort().map((key) => `
      <div class="swimgroup"><h2>${esc(key)} <span>${groups[key].length}</span></h2>
      <div class="swimrow">${groups[key].map((it) => itemCardHtml(it, REPO)).join("")}</div></div>`).join("")
      || '<p class="empty">No items match.</p>';
  }
}

function renderSearch() {
  const q = $("corpusSearch").value;
  const box = $("searchResults");
  if (!q.trim()) { box.hidden = true; return; }
  const hits = searchCorpus(INDEX, q).slice(0, 20);
  box.hidden = false;
  box.innerHTML = hits.length
    ? hits.map((e) => `<a class="hit ${esc(e.kind)}" href="${esc(e.url || "#")}">
        <b>${esc(e.title)}</b><span class="hit-kind">${esc(e.kind)}${e.status ? " · " + esc(e.status) : ""}</span></a>`).join("")
    : '<p class="empty">Nothing found — looks new. You could be the first to file it.</p>';
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
    const delta = { available: 0, claimed: 0, "in-pr": 0 };
    for (const item of DATA.items) {
      const live = openByDe.get(item.id);
      if (live && item.status === "available") {
        item.status = live.status;
        item.owner = live.owner;
        delta.available -= 1;
        delta[live.status] += 1;
      }
    }
    const changed = -delta.available;
    if (changed) {
      const c = DATA.meta.counts;
      c.available += delta.available;
      c.claimed += delta.claimed;
      c["in-pr"] += delta["in-pr"];
      renderMetrics();
      renderBoard();
      $("subtitle").textContent = `Live · ${changed} update(s) since last build.`;
    }
  } catch { /* offline: baseline stands */ }
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

  renderMetrics();
  renderBoard();

  const stale = $("stale");
  if (DATA.meta.warnings?.length) { stale.hidden = false; stale.textContent = DATA.meta.warnings.join(" "); }
  $("footNote").innerHTML = `Built ${new Date(DATA.meta.generatedAt).toLocaleString()} · ` +
    `<a href="${DATA.meta.issuesUrl}">issues</a> · <a href="${DATA.meta.pullsUrl}">PRs</a> · ${DATA.meta.botPrCount} bot PRs hidden`;

  ["q", "theme", "track", "difficulty", "status"].forEach((id) => $(id).addEventListener("input", renderBoard));
  document.querySelectorAll('input[name="swim"]').forEach((r) => r.addEventListener("change", renderBoard));
  $("corpusSearch").addEventListener("input", renderSearch);

  liveOverlay(); // fire-and-forget
}

main();
