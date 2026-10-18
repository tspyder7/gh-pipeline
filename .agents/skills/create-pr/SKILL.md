---
name: create-pr
description:
    Create a GitHub pull request from the current branch, draft the title and body, suggest labels, present everything for review, and only after explicit confirmation create or update the PR and apply the labels. Detects an existing open PR for the branch and asks whether to update it or
    close it and create a new one first. Pushes the branch when it is not pushed yet, then proceeds.
    Never creates, updates, closes, or labels a PR before the user approves.
    Trigger when the user says "create PR", "open a PR", "make a pull request", "raise a PR",
    "submit this branch as a PR", or otherwise asks to open a pull request for the current branch.
compatibility: opencode
metadata:
    audience: developers
    workflow: github
---

# Create PR Skill

Take the current branch to a reviewed pull request. Draft the description, suggest labels, show the
complete plan, and execute only what the user approved. The skill never commits, force-pushes,
deletes branches, or reopens pull requests. When the current branch is not pushed yet, it performs
one normal (non-force) push early in Step 1 and then proceeds; beyond that it only creates,
updates, closes (only when chosen at the existing-PR gate), and labels the PR.

## Gates

No pull request is created, updated, closed, or labeled before every required gate passes. (The
Step 1 push of the current branch, when needed, happens before the review gate by design.)

1. **Existing-PR gate** — when the branch already has an open PR, ask whether to update it or to
   close it and create a new one. Never assume.
2. **Review gate** — present the exact title, body, labels, and planned actions, then ask with
   exactly these three options: **Create PR**, **Don't Create PR**, **Need Changes**.
3. **Write execution** — only after **Create PR**, run exactly the actions shown at the review
   gate — nothing more.

## Step 1 — Preconditions

1. Detect the repository, current branch, default base branch, and any open PR for the branch:

    ```
    node scripts/find-pr.mjs
    ```

    It prints `{ repo, branch, defaultBase, openPullRequest }`. `openPullRequest` is `null` when
    none exists.

2. Stop and report — do not proceed — if the branch equals `defaultBase` or HEAD is detached (no
   branch).

3. Ensure the branch is pushed; push it now when needed:
    - `git rev-parse --abbrev-ref @{u}` fails → no upstream: run `git push -u origin <branch>`.
    - `git rev-parse --abbrev-ref @{u}` succeeds and `git log @{u}..HEAD --oneline` prints anything
      → unpushed commits: run `git push`.
    - Otherwise the branch is already pushed: do nothing.
    - If there is no `origin` remote, stop and report.

    If the push fails, stop and report — never force-push and never retry with `--force`. When the
    push succeeds, continue to Step 2.

## Step 2 — Existing-PR gate

When `openPullRequest` is not `null`, ask the user which mode to use before drafting anything:

- **Update existing PR** — refresh the title, body, and labels of PR #`<number>`.
- **Close it and create new** — close PR #`<number>` first (a branch cannot have two open PRs),
  then create a fresh PR.

Use the `question` tool when available; otherwise print the two options and wait. Never close a PR
silently and never assume update. When the user chooses close + create, the close becomes part of
the review gate's plan and still runs only after **Create PR** approval.

## Step 3 — Draft the description

Gather inputs from the current branch:

```
git log <base>..HEAD --oneline
git diff <base>...HEAD
```

where `<base>` is `defaultBase` unless the user specifies another base. If the local base ref
cannot be resolved, try `origin/<base>`.

Then fill the template in `assets/pr-template.md` — read it and follow it exactly: no extra
sections, no reordering. The body never contains the title: no `**Title:**` line and no H1 heading;
the title is only passed separately via `--title`.

- **Title**: short imperative subject, 50 characters or less, format `[type]: short description`
  where type is one of `feat`, `fix`, `refactor`, `chore`, `docs`, `test`. Example:
  `feat: add rate limiting to auth endpoints`. Never duplicate it in the body.
- **Description**: 2–4 plain-English sentences on what the PR does and why, written for someone
  who has not seen the code. Avoid vague phrases like "various fixes".
- **Changes**: action-verb bullets (Add, Fix, Remove, Refactor, Update, Extract, Move); one idea
  per bullet; as many bullets as needed; skip mechanical noise (formatting, lint) unless that is
  the whole PR.
- **Related Issue**: `Closes #<number>` when known; if a Jira/Linear ticket is known, put it here
  (e.g. `Closes JIRA-456`). If nothing is known, leave `Closes #` and note it to the user.

If the input is ambiguous, make a reasonable attempt first, then note your assumptions in the
review — do not interrogate the user before trying.

## Step 4 — Suggest labels

Fetch the repository's configured labels (read-only):

```
node scripts/fetch-labels.mjs [owner/repo]
```

Pick only labels that exist in that output:

- **Type**: suggest every `type:*` label that genuinely applies — often more than one (a feature
  PR that also adds tests → `type:feature`, `type:test`). Never force a single label, never pad
  the list with labels that do not apply.
- **Other families**: judge every remaining fetched label by its name and description and include
  the applicable ones (for example `scope:*`, `area:*`).
- **Status / Priority**: do not suggest `status:*` or `priority:*` unless the user explicitly
  asks.
- Never invent a label that is not in the fetched list. If none applies, say so explicitly.

Present the labels as one comma-separated line, e.g. `Labels: type:feature, type:test`.

## Step 5 — Review gate (MANDATORY)

Show the user, in one block:

- **Action**: `Create new PR` / `Update PR #<n>` / `Close PR #<n>, then create new PR`
- **Repository** and **branches**: `<base> ← <head>`
- **Title**
- **Body**: the full markdown in a code block (copy-ready)
- **Labels**: comma-separated list (or "none")
- **Planned actions**: the exact commands that will run, in order — for example:

    ```
    node scripts/update-pr.mjs 12 --title "..." --base main --body-stdin <<'PR_BODY'
    <approved body markdown>
    PR_BODY
    node scripts/add-labels.mjs 12 type:feature,type:test
    ```

    For close + create, the plan lists, for example:

    ```
    node scripts/close-pr.mjs 12
    node scripts/create-pr.mjs --title "..." --base main --body-stdin <<'PR_BODY'
    <approved body markdown>
    PR_BODY
    node scripts/add-labels.mjs <new-pr-number> type:feature,type:test
    ```

Then ask the confirmation question with exactly these three options (use the `question` tool when
available):

1. **Create PR**
2. **Don't Create PR**
3. **Need Changes**

How to handle the answer:

- **Create PR** → execute the planned actions exactly as shown (Step 6). Nothing beyond them.
- **Don't Create PR** → stop. Run no write script. Confirm to the user that no PR was created,
  updated, closed, or labeled; when Step 1 pushed the branch, note that the push already ran.
- **Need Changes** → the user tells you what to change (title, body, labels, base branch, or the
  existing-PR mode). Apply the changes and present the updated review block again. Approval never
  carries over from a previous version.

## Step 6 — Execute

Only after **Create PR** approval. Never write the approved body to a file — not even a temporary
one. Keep it in memory and pass it to the script on stdin with a quoted heredoc so the shell
leaves the markdown untouched; `--body` also works for a short, single-line body.

- Create new:
  `node scripts/create-pr.mjs --title <title> [--base <branch>] --body-stdin <<'PR_BODY'`,
  followed by the approved body markdown and a closing `PR_BODY` line.
- Update existing:
  `node scripts/update-pr.mjs <pr-number> --title <title> [--base <branch>] --body-stdin <<'PR_BODY'`
  with the same heredoc. Pass only what the user approved: `--title`, `--base`, and the body are
  each optional for updates.
- Close + create: run `node scripts/close-pr.mjs <pr-number>` first, then create as above.
  Close first — creating fails while the branch still has an open PR. If the create then fails,
  tell the user the old PR was closed and can be reopened.
- Labels: `node scripts/add-labels.mjs <pr-number> <label1,label2,...>` with the approved labels
  (skip when the list is empty). This script only adds labels; it never removes any.

Never edit the approved body, title, labels, base branch, or action list at execution time. If
something needs to change, go back to the review gate.

## Step 7 — Report

Report:

- The push result, when Step 1 pushed the branch.
- The created / updated / closed PR number and URL.
- The labels applied (or that none were suggested).
- Any action that failed, exactly as it failed, and what remains true afterwards (for example
  "PR #12 was created but labels were not applied").

## Scripts

All paths are relative to this skill's folder (`.agents/skills/create-pr/`). The scripts are plain
Node.js using core modules only; the only external tool they shell out to is `gh`.

| Script                                                                     | Type      | Purpose                                                       |
| -------------------------------------------------------------------------- | --------- | ------------------------------------------------------------- |
| `scripts/find-pr.mjs [branch]`                                             | read-only | Repo, branch, default base, open PR for the branch as JSON.   |
| `scripts/fetch-labels.mjs [owner/repo]`                                    | read-only | Labels configured on the repository as JSON.                  |
| `scripts/create-pr.mjs --title <t> [--body <md>] [--body-stdin] [--base <b>]`   | write     | Create a PR from the current branch (never a draft).          |
| `scripts/update-pr.mjs <pr-number> [--title <t>] [--body <md>] [--body-stdin] [--base <b>]` | write | Update an existing PR.             |
| `scripts/close-pr.mjs <pr-number>`                                         | write     | Close an existing PR; never deletes the branch.               |
| `scripts/add-labels.mjs <pr-number> <label1,label2>`                       | write     | Add labels to a PR; never removes existing labels.            |

## Hard Rules

1. Never run `create-pr.mjs`, `update-pr.mjs`, `close-pr.mjs`, or `add-labels.mjs` before the
   user answers **Create PR** at the review gate.
2. The review gate offers exactly three options: Create PR / Don't Create PR / Need Changes.
3. **Don't Create PR** means zero write operations.
4. **Need Changes** loops back to the review gate; re-ask after every revision.
5. Existing open PR → ask update vs close + create; never close silently; the close appears in the
   reviewed plan and runs only with the same approval.
6. Never commit, force-push, delete branches, or reopen PRs. The only allowed push is a normal
   (non-force) `git push` of the current branch, performed in Step 1 when the branch is not pushed
   yet. Never push other branches or tags, and never retry a failed push with `--force`.
7. Never remove labels and never invent labels. Only labels present in `fetch-labels.mjs` output
   may be suggested; only user-approved labels are applied.
8. The review block must show the full body and every command that will run. No hidden actions.
9. What was approved is exactly what runs — no edits after approval.
10. Never create the pull request as a draft. Drafts are not used; the PR is always opened ready
    for review.
11. Never write the body to a file — no temp files, no files in the repo. Pass it to the scripts
    via stdin (`--body-stdin` with a quoted heredoc) or inline with `--body`.
12. The PR body never includes the title — no `**Title:**` line, no H1 heading. The title is passed
    only as the `--title` flag and shown as its own field in the review gate.
