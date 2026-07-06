const isBot = (u) => u?.type === "Bot" || /\[bot\]$/.test(u?.login ?? "");

function normalize(raw) {
  const isPr = Boolean(raw.pull_request);
  return {
    kind: isPr ? "pr" : "issue",
    number: raw.number,
    title: raw.title ?? "",
    body: raw.body ?? "",
    url: raw.html_url,
    state: raw.state,
    merged: isPr ? Boolean(raw.pull_request.merged_at) : false,
    author: raw.user?.login ?? null,
    assignee: raw.assignee?.login ?? null,
    labels: (raw.labels ?? []).map((l) => (typeof l === "string" ? l : l.name)),
  };
}

export async function fetchActivity({ repo, token, fetchImpl = fetch, maxPages = 20 }) {
  const headers = { Accept: "application/vnd.github+json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const issues = [];
  const prs = [];
  let botCount = 0;
  let truncated = false;
  for (let page = 1; page <= maxPages; page += 1) {
    const url = `https://api.github.com/repos/${repo}/issues?state=all&per_page=100&page=${page}`;
    const res = await fetchImpl(url, { headers });
    if (!res.ok) throw new Error(`GitHub API ${res.status} for ${url}`);
    const batch = await res.json();
    if (!batch.length) break;
    for (const raw of batch) {
      if (isBot(raw.user)) { botCount += 1; continue; }
      const item = normalize(raw);
      (item.kind === "pr" ? prs : issues).push(item);
    }
    // A full final page at the cap means more items likely exist beyond it.
    if (page === maxPages && batch.length === 100) truncated = true;
  }
  return { issues, prs, botCount, truncated };
}
