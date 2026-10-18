# resolve-pr-comments

Triage PR review comments, write an analysis file, and draft status-first replies — code changes and replies stay untouched until explicitly approved.

## What it does

- **Gathers the comments** — from a PR number or URL via `scripts/fetch-comments.mjs` (inline review comments, review summaries, general comments), or from comment text pasted into the conversation.
- **Reads the real code** — opens each commented file at its current state in the working tree before judging; the diff hunk alone can be stale.
- **Classifies every comment** — Actionable, Addressable without a code change, or Not required (with a concrete, specific reason).
- **Writes an analysis file** — one section per comment, in original order, at `docs/pr-reviews/pr-<number-or-slug>-analysis.md`.
- **Drafts replies at all four verbosity levels** for every comment, so the level can be swapped per comment later.
- **Enforces two approval gates** — applies only approved diffs, checks test coverage for behavioral changes, and posts replies only after a separate explicit approval to post.

Replies are status-first, robotic, and free of pleasantries:

| Status | Meaning |
|---|---|
| `Resolved.` | Clarified or already satisfied; no code change |
| `Done.` | Code changed as requested |
| `Not required: <reason>.` | No change; the reason is mandatory and concrete |

Verbosity levels:

- **minimal** (default) — status line only.
- **concise** — status plus one short clause.
- **standard** — status plus one to two sentences.
- **detailed** — status plus a full explanation.

## How to invoke

```
resolve the comments on PR #123
go through the review feedback on this PR
triage the PR comments            # or paste comment text directly
```

Or run `/resolve-pr-comments` with a PR number/URL; optional reply style: `minimal | concise | standard | detailed`.

## Analysis file (per comment)

```markdown
## Comment 2 — src/router.ts:48 (reviewer)

> This needs a null check before dereferencing region.

**Classification:** Actionable

**Analysis:** region can be undefined when the repository has no default branch configured.

**Decision:** Done — null check added.

**Draft replies:**
- Minimal: Done.
- Concise: Done. Added null check before dereferencing region.
```

## Scripts

Node.js core modules only — no dependencies; the only external tool is `gh`. Paths are relative to this skill's folder.

```
node scripts/fetch-comments.mjs <pr-number-or-url>                              # read-only
node scripts/post-inline-reply.mjs <owner/repo> <pr> <comment-id> <body-file>   # write
node scripts/post-general-comment.mjs <owner/repo> <pr> <body-file>             # write
```

## See also

- [`SKILL.md`](./SKILL.md) — full LLM-facing instructions
