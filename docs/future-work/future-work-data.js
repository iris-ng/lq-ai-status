window.FUTURE_WORK_DATA = {
  "generatedAt": "2026-07-05T00:00:00.000Z",
  "source": {
    "prdUrl": "https://github.com/LegalQuants/lq-ai/blob/main/docs/PRD.md#9-deferred-enhancements-and-identified-future-work",
    "issuesUrl": "https://github.com/LegalQuants/lq-ai/issues",
    "pullsUrl": "https://github.com/LegalQuants/lq-ai/pulls",
    "note": "Local shell network access could not resolve github.com, so this demo is seeded from public GitHub page metadata visible during prototyping. The generator script parses docs/PRD.md when run in a checked-out lq-ai repository."
  },
  "github": {
    "openIssueCount": 0,
    "openPullRequestCount": 15,
    "openPullRequests": [
      {
        "number": 142,
        "title": "chore(deps): update cryptography requirement from <46,>=42 to >=42,<49 in /gateway",
        "author": "dependabot",
        "url": "https://github.com/LegalQuants/lq-ai/pull/142"
      },
      {
        "number": 132,
        "title": "chore(deps): update uvicorn requirement from <0.34,>=0.32 to >=0.32,<0.50 in /gateway",
        "author": "dependabot",
        "url": "https://github.com/LegalQuants/lq-ai/pull/132"
      },
      {
        "number": 131,
        "title": "chore(deps): update uvicorn requirement from <0.48,>=0.32 to >=0.32,<0.50 in /api",
        "author": "dependabot",
        "url": "https://github.com/LegalQuants/lq-ai/pull/131"
      },
      {
        "number": 124,
        "title": "chore(deps): bump actions/setup-node from 4 to 6",
        "author": "dependabot",
        "url": "https://github.com/LegalQuants/lq-ai/pull/124"
      },
      {
        "number": 123,
        "title": "chore(deps): bump actions/attest-build-provenance from 1 to 4",
        "author": "dependabot",
        "url": "https://github.com/LegalQuants/lq-ai/pull/123"
      },
      {
        "number": 122,
        "title": "chore(deps): bump actions/checkout from 4 to 6",
        "author": "dependabot",
        "url": "https://github.com/LegalQuants/lq-ai/pull/122"
      },
      {
        "number": 113,
        "title": "chore(deps): bump html2canvas-pro from 1.6.7 to 2.0.4 in /web",
        "author": "dependabot",
        "url": "https://github.com/LegalQuants/lq-ai/pull/113"
      },
      {
        "number": 112,
        "title": "chore(deps): bump panzoom from 9.4.3 to 9.4.4 in /web",
        "author": "dependabot",
        "url": "https://github.com/LegalQuants/lq-ai/pull/112"
      },
      {
        "number": 111,
        "title": "chore/deps: bump i18next from 23.16.8 to 26.3.0 in /web",
        "author": "dependabot",
        "url": "https://github.com/LegalQuants/lq-ai/pull/111"
      },
      {
        "number": 109,
        "title": "chore(deps): update fastapi requirement from <0.117,>=0.115 to >=0.115,<0.138 in /gateway",
        "author": "dependabot",
        "url": "https://github.com/LegalQuants/lq-ai/pull/109"
      },
      {
        "number": 108,
        "title": "chore(deps): bump mermaid from 11.14.0 to 11.15.0 in /web",
        "author": "dependabot",
        "url": "https://github.com/LegalQuants/lq-ai/pull/108"
      },
      {
        "number": 107,
        "title": "chore(deps): update redis requirement from <6,>=5.0 to >=5.0,<9 in /api",
        "author": "dependabot",
        "url": "https://github.com/LegalQuants/lq-ai/pull/107"
      },
      {
        "number": 73,
        "title": "chore(deps): update fastapi requirement from <0.117,>=0.115 to >=0.115,<0.137 in /api",
        "author": "dependabot",
        "url": "https://github.com/LegalQuants/lq-ai/pull/73"
      },
      {
        "number": 72,
        "title": "chore(deps): bump marked from 9.1.6 to 18.0.4 in /web",
        "author": "dependabot",
        "url": "https://github.com/LegalQuants/lq-ai/pull/72"
      },
      {
        "number": 66,
        "title": "chore(deps): update docling requirement from <2,>=1.16 to >=1.16,<3 in /api",
        "author": "dependabot",
        "url": "https://github.com/LegalQuants/lq-ai/pull/66"
      }
    ]
  },
  "items": [
    {
      "id": "future-001",
      "title": "PRD deferred enhancement extraction",
      "summary": "Parse section 9 of docs/PRD.md into stable enhancement records with IDs, titles, summaries, area, difficulty, impact, and tags.",
      "area": "docs",
      "difficulty": "small",
      "impact": "high",
      "status": "available",
      "owner": null,
      "source": "prototype",
      "tags": ["prd", "roadmap", "metadata"],
      "matches": []
    },
    {
      "id": "future-002",
      "title": "GitHub issue and PR claim detection",
      "summary": "Detect whether a deferred enhancement has an open issue, a linked pull request, an assignee, or a merged implementation.",
      "area": "automation",
      "difficulty": "medium",
      "impact": "high",
      "status": "available",
      "owner": null,
      "source": "prototype",
      "tags": ["github", "issues", "pull-requests"],
      "matches": []
    },
    {
      "id": "future-003",
      "title": "Semantic matching review queue",
      "summary": "Use fuzzy title/body matching to suggest likely issue and PR links, but require explicit confirmation before an item becomes claimed.",
      "area": "automation",
      "difficulty": "medium",
      "impact": "medium",
      "status": "needs-review",
      "owner": null,
      "source": "prototype",
      "tags": ["matching", "triage", "quality"],
      "matches": [
        {
          "type": "pull_request",
          "number": 108,
          "title": "chore(deps): bump mermaid from 11.14.0 to 11.15.0 in /web",
          "url": "https://github.com/LegalQuants/lq-ai/pull/108",
          "confidence": 0.34,
          "reason": "Shares visualization-related dependency context, but title is dependency maintenance and should not auto-claim this enhancement."
        }
      ]
    },
    {
      "id": "future-004",
      "title": "Interactive future-work dashboard",
      "summary": "Publish a clickable HTML artefact with filters, sorting, clusters, and links back to PRD sections, GitHub issues, and PRs.",
      "area": "web",
      "difficulty": "medium",
      "impact": "high",
      "status": "available",
      "owner": null,
      "source": "prototype",
      "tags": ["dashboard", "github-pages", "visualization"],
      "matches": []
    },
    {
      "id": "future-005",
      "title": "Contributor-friendly task labels",
      "summary": "Add standard labels for area, difficulty, impact, and availability so contributors can filter for work that fits their interest.",
      "area": "governance",
      "difficulty": "small",
      "impact": "medium",
      "status": "available",
      "owner": null,
      "source": "prototype",
      "tags": ["labels", "contributors", "triage"],
      "matches": []
    }
  ]
};
