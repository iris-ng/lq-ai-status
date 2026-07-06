import { cosine } from "./embed.mjs";

const textOf = (x) => `${x.title ?? ""} ${x.description ?? x.body ?? ""}`.trim();

export async function enrich({ items, unlinked, activity, embed, threshold = 0.45 }) {
  const itemVecs = new Map();
  for (const it of items) itemVecs.set(it.id, await embed(textOf(it)));

  const unlinkedVecs = [];
  for (const a of unlinked) unlinkedVecs.push({ a, v: await embed(textOf(a)) });

  const enriched = items.map((it) => {
    const v = itemVecs.get(it.id);
    const related = [];
    for (const other of items) {
      if (other.id === it.id) continue;
      const score = cosine(v, itemVecs.get(other.id));
      if (score >= threshold) related.push({ kind: "de", ref: other.id, score });
    }
    for (const { a, v: av } of unlinkedVecs) {
      const score = cosine(v, av);
      if (score >= threshold) related.push({ kind: a.kind, ref: a.number, score });
    }
    related.sort((x, y) => y.score - x.score);
    return { ...it, related: related.slice(0, 5) };
  });

  const searchIndex = [
    ...enriched.map((it) => ({
      kind: "de", ref: it.id, title: `${it.id}: ${it.title}`, text: textOf(it),
      status: it.status, theme: it.theme, track: it.track, url: it.prdAnchor,
    })),
    ...[...activity.issues, ...activity.prs].map((a) => ({
      kind: a.kind, ref: a.number, title: `#${a.number}: ${a.title}`, text: textOf(a),
      status: a.state === "closed" ? "done" : a.kind === "pr" ? "in-pr" : "open", url: a.url,
    })),
  ];

  return { items: enriched, searchIndex };
}
