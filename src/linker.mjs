const DE_RE = /\bDE-(\d{2,4})\b/g;

function idsIn(activity) {
  const text = `${activity.title} ${activity.body}`;
  const found = new Set();
  for (const m of text.matchAll(DE_RE)) found.add(`DE-${m[1]}`);
  return found;
}

function toRef(a) {
  return { number: a.number, url: a.url, state: a.state, merged: a.merged };
}

function statusFor(issues, prs) {
  if (prs.some((p) => p.merged)) return "done";
  if ([...issues, ...prs].some((x) => x.state === "closed")) return "done";
  if (prs.some((p) => p.state === "open")) return "in-pr";
  if (issues.some((i) => i.state === "open")) return "claimed";
  return "available";
}

function ownerFor(issues, prs) {
  const openIssue = issues.find((i) => i.state === "open");
  if (openIssue) return openIssue.assignee || openIssue.author;
  const openPr = prs.find((p) => p.state === "open");
  if (openPr) return openPr.author;
  // For done items, keep attribution: prefer the merged PR's author, else any closed author.
  const mergedPr = prs.find((p) => p.merged);
  if (mergedPr) return mergedPr.author;
  const closed = [...prs, ...issues].find((x) => x.state === "closed");
  if (closed) return closed.assignee || closed.author;
  return null;
}

export function link(items, activity) {
  const all = [...activity.issues, ...activity.prs];
  const known = new Set(items.map((i) => i.id));
  const refs = new Map(items.map((i) => [i.id, { issues: [], prs: [] }]));

  for (const a of all) {
    for (const id of idsIn(a)) {
      if (refs.has(id)) refs.get(id)[a.kind === "pr" ? "prs" : "issues"].push(a);
    }
  }

  const linkedItems = items.map((item) => {
    const { issues, prs } = refs.get(item.id);
    return {
      ...item,
      status: statusFor(issues, prs),
      owner: ownerFor(issues, prs),
      links: { ...item.links, issues: issues.map(toRef), prs: prs.map(toRef) },
    };
  });

  const unlinked = all.filter((a) => ![...idsIn(a)].some((id) => known.has(id)));
  return { items: linkedItems, unlinked };
}
