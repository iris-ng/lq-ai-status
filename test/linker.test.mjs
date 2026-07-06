import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { link } from "../src/linker.mjs";

const activity = JSON.parse(await readFile(new URL("./fixtures/activity.json", import.meta.url), "utf8"));
const items = [
  { id: "DE-296", links: {} }, { id: "DE-035", links: {} }, { id: "DE-201", links: {} },
];
const { items: linked, unlinked } = link(items, activity);
const byId = Object.fromEntries(linked.map((i) => [i.id, i]));

test("open issue -> claimed with owner", () => {
  assert.equal(byId["DE-296"].status, "claimed");
  assert.equal(byId["DE-296"].owner, "thepranky");
  assert.deepEqual(byId["DE-296"].links.issues.map((r) => r.number), [222]);
});

test("open PR -> in-pr", () => {
  assert.equal(byId["DE-035"].status, "in-pr");
  assert.equal(byId["DE-035"].owner, "dropthejase");
});

test("no references -> available", () => {
  assert.equal(byId["DE-201"].status, "available");
  assert.equal(byId["DE-201"].owner, null);
});

test("activity with no known DE id becomes unlinked", () => {
  assert.deepEqual(unlinked.map((a) => a.number), [900]);
});

const pr = (n, id, extra) => ({ kind: "pr", number: n, title: id, body: "", url: `u/${n}`, merged: false, author: "auth", assignee: null, ...extra });
const issue = (n, id, extra) => ({ kind: "issue", number: n, title: id, body: "", url: `u/${n}`, state: "open", merged: false, author: "auth", assignee: null, ...extra });

test("merged PR -> done, with the PR author as owner", () => {
  const { items: out } = link([{ id: "DE-11", links: {} }], {
    issues: [], prs: [pr(1, "DE-11", { state: "closed", merged: true, author: "mia" })],
  });
  assert.equal(out[0].status, "done");
  assert.equal(out[0].owner, "mia");
});

test("closed issue with no merged PR -> done", () => {
  const { items: out } = link([{ id: "DE-12", links: {} }], {
    issues: [issue(2, "DE-12", { state: "closed", author: "ann" })], prs: [],
  });
  assert.equal(out[0].status, "done");
  assert.equal(out[0].owner, "ann");
});

test("merged PR outranks an open issue (done wins)", () => {
  const { items: out } = link([{ id: "DE-13", links: {} }], {
    issues: [issue(3, "DE-13", { assignee: "op" })],
    prs: [pr(4, "DE-13", { state: "closed", merged: true, author: "why" })],
  });
  assert.equal(out[0].status, "done");
});

test("one activity item citing two known DE-ids links to both", () => {
  const { items: out } = link([{ id: "DE-10", links: {} }, { id: "DE-20", links: {} }], {
    issues: [issue(5, "DE-10 / DE-20 combined")], prs: [],
  });
  const m = Object.fromEntries(out.map((i) => [i.id, i.status]));
  assert.equal(m["DE-10"], "claimed");
  assert.equal(m["DE-20"], "claimed");
});
