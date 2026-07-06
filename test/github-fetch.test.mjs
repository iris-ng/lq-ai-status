import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchActivity } from "../src/github-fetch.mjs";

function fakeFetch(pages) {
  let call = 0;
  return async () => {
    const body = pages[call] ?? [];
    call += 1;
    return { ok: true, status: 200, json: async () => body };
  };
}

const page1 = [
  { number: 222, title: "DE-296 wizard", body: "", html_url: "u/222", state: "open",
    user: { login: "thepranky", type: "User" }, assignee: null, labels: [{ name: "enhancement" }] },
  { number: 265, title: "feat (DE-035)", body: "", html_url: "u/265", state: "open",
    user: { login: "dropthejase", type: "User" }, assignee: null, labels: [],
    pull_request: { merged_at: null } },
  { number: 132, title: "bump uvicorn", body: "", html_url: "u/132", state: "open",
    user: { login: "dependabot[bot]", type: "Bot" }, assignee: null, labels: [],
    pull_request: { merged_at: null } },
];

test("separates issues from PRs and drops bots", async () => {
  const { issues, prs, botCount } = await fetchActivity({
    repo: "o/r", token: "t", fetchImpl: fakeFetch([page1, []]),
  });
  assert.deepEqual(issues.map((i) => i.number), [222]);
  assert.deepEqual(prs.map((p) => p.number), [265]);
  assert.equal(botCount, 1);
  assert.equal(issues[0].kind, "issue");
  assert.equal(prs[0].kind, "pr");
});

test("resolves merged PRs to merged: true", async () => {
  const page = [
    { number: 300, title: "done (DE-1)", body: "", html_url: "u/300", state: "closed",
      user: { login: "x", type: "User" }, assignee: null, labels: [],
      pull_request: { merged_at: "2024-01-01T00:00:00Z" } },
  ];
  const { prs } = await fetchActivity({ repo: "o/r", fetchImpl: fakeFetch([page, []]) });
  assert.equal(prs[0].merged, true);
});

test("flags truncation when a full page is returned at the page cap", async () => {
  const full = Array.from({ length: 100 }, (_, i) => ({
    number: i, title: "x", body: "", html_url: `u/${i}`, state: "open",
    user: { login: "u", type: "User" }, assignee: null, labels: [],
  }));
  const { truncated } = await fetchActivity({
    repo: "o/r", fetchImpl: fakeFetch([full, full]), maxPages: 1,
  });
  assert.equal(truncated, true);
});

test("does not flag truncation when pages are exhausted", async () => {
  const { truncated } = await fetchActivity({ repo: "o/r", fetchImpl: fakeFetch([page1, []]) });
  assert.equal(truncated, false);
});
