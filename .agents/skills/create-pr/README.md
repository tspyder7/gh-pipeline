# create-pr

Create a GitHub pull request from the current branch: draft the title and body, suggest labels,
show everything for review, and only then create or update the PR and apply the labels.

Self-contained: the skill carries its own copy of the PR template
(`assets/pr-template.md`) and its own label-fetching script — no dependency on other skills.

## What it does

1. **Preconditions** — detects the repo, current branch, default base branch, and any open PR for
   the branch via `scripts/find-pr.mjs`. Stops if the branch is the default branch or is not
   pushed; it never pushes for you.
2. **Existing-PR gate** — if the branch already has an open PR, asks whether to update that PR or
   close it and create a new one. Never closes silently.
3. **Draft the description** — fills its own copy of the PR template from `git log` / `git diff`
   against the base branch: imperative title (`feat: …`, `fix: …`), plain-English description,
   action-verb bullets, `Closes #` line.
4. **Labels** — fetches the repository's real label list and suggests every applicable label
   (all matching `type:*` labels, plus applicable `scope:*` / `area:*` / etc.). Never invents
   labels; never suggests `status:*` or `priority:*` unless asked.
5. **Review gate (mandatory)** — shows the title, full body, labels, and the exact commands that
   will run, then asks with exactly three options:
   - **Create PR**
   - **Don't Create PR**
   - **Need Changes**
6. **Execute** — only on **Create PR**: creates or updates the PR (never as a draft), passes the
   approved body inline/stdin without writing temp files, adds the approved labels, and reports
   the PR URL. Nothing else is ever run.

## How to invoke

```
create PR
open a PR
make a pull request
raise a PR from this branch
```

The command `/create-pr` invokes the skill directly.

## Scripts

Node.js core modules only — no dependencies; the only external tool is `gh`. Paths are relative to
this skill's folder.

```
node scripts/find-pr.mjs [branch]                                  # read-only
node scripts/fetch-labels.mjs [owner/repo]                         # read-only
node scripts/create-pr.mjs --title <t> [--body <md> | --body-stdin] [--base <b>]
node scripts/update-pr.mjs <pr-number> [--title <t>] [--body <md> | --body-stdin] [--base <b>]
node scripts/close-pr.mjs <pr-number>
node scripts/add-labels.mjs <pr-number> <label1,label2,...>
```

The four write scripts above must only be run after the user answers **Create PR** at the review
gate. The approved body is never written to a temp file; pass it inline with `--body` or via a
quoted stdin heredoc with `--body-stdin`.

## See also

- [`SKILL.md`](./SKILL.md) — full LLM-facing instructions and hard rules
