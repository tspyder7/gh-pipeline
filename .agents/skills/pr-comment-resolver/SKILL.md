---
name: pr-comment-resolver
description:
    Analyze a batch of pull request review comments, write a detailed analysis
    markdown file, and draft status-first replies (Resolved / Done / Not required)
    at four verbosity levels. Use when asked to triage PR review comments, respond
    to review feedback, or work through a batch of review comments. Never edits code
    or posts replies until the user explicitly approves each one.
compatibility: opencode
metadata:
    audience: developers
    workflow: github
---

# PR Comment Resolver Skill

Take a batch of pull request review comments through triage: judge each one, record the analysis, and prepare replies. The generated analysis markdown file is the artifact the user reviews and approves — no source file is edited and nothing is posted to GitHub until the user explicitly approves it. Approval of the analysis and approval to post replies are two separate gates.

## Inputs

- The PR comments, provided as either:
  - a PR number or URL — fetch them with `gh`, or
  - comment text pasted directly into the conversation.
- Optionally, for some or all comments, explicit instructions describing the change to make — supplied up front or later while reviewing the analysis file. When the user has specified the change for a comment, use exactly that instead of deriving a fix independently.
- Optional reply verbosity: `minimal` (default), `concise`, `standard`, `detailed`. When none is given, use `minimal`.

## Steps

1. **Gather the comments.**
   - When a PR number or URL was provided, run `node scripts/fetch-comments.mjs <pr-number-or-url>`. The script resolves `owner/repo` and prints a single JSON object on stdout containing `inline_comments`, `reviews`, and `general_comments` — parse that output instead of hand-rolling `gh` calls.
   - When comments were pasted directly, use them as given. Ask for a PR number or URL only if the user later wants replies posted and none was provided.

2. **Read the real code.** Before judging each inline comment, open the referenced file at its current state in the working tree — not just the diff hunk, which can be stale or lack context.

3. **Classify each comment:**
   - **Actionable** — a real bug, correctness issue, or explicitly requested change that is in scope for this PR.
   - **Addressable without a code change** — a question, misunderstanding, or concern already satisfied by the existing code, tests, or design; answer it and edit nothing.
   - **Not required** — a suggestion, preference, or out-of-scope idea the analysis rejects; it must carry a concrete, specific reason.
   - Scope discipline: propose only the change the comment actually asks for. No drive-by refactors, no unrelated cleanup, no gold-plating "while I'm here."

4. **Determine the fix, do not apply it.** For actionable comments:
   - When the user already specified the exact change for this comment, use that.
   - Otherwise, work out the minimal diff that satisfies the comment exactly.
   - Either way, record it in the analysis file as a proposed diff — do not call Edit or Write on source files at this stage.

5. **Write the analysis file.** When the project already has a convention for review or planning docs (for example, a `docs/` folder used for similar write-ups), follow it; otherwise use `docs/pr-reviews/pr-<number-or-slug>-analysis.md`, creating the folder if needed. Write one section per comment, in the original order, following the template below.

6. **Draft replies at all four verbosity levels** for every comment — not just the level requested — see Reply Rules and Verbosity Levels. This lets the user swap the level for any comment later, even when one level was requested overall.

7. **Point the user at the analysis file and stop — this is the approval gate for changes.** Give the user the file path and ask them to validate the classification, decision, and proposed diff for each comment. While this gate is open, do not edit any source file and do not post or reply to anything on GitHub. One of three things happens next:
   - The user approves the file as-is, or approves specific comments in it → proceed to step 8 for the approved scope only.
   - The user corrects a classification, rejects a proposed diff, or supplies a different exact fix for a comment → update the analysis file to match, then point the user at it again and wait for approval; repeat until approved.
   - The user rejects a comment's change outright → mark it `Not required` in the file with the reason given and treat it as approved-as-rejected (no code change, no further diff needed for it).

8. **Apply only what is approved.** After explicit approval of the (possibly revised) analysis file, apply exactly the approved diffs — nothing else and nothing that differs from what the file records. When the user approves some comments' changes and not others, apply only the approved subset.

9. **Check test coverage for every applied change that affects behavior** (skip this for pure comment, formatting, and documentation changes). This step is deliberately tool-agnostic — detect the project's own conventions instead of assuming any:
   - Find the affected module/package and its test command by reading what is already in the repo (for example a `scripts.test` entry in `package.json`, a `Makefile` target, `tox.ini`, `pom.xml`, or a CI config step) — do not assume a language, package manager, or test framework.
   - Run that command, scoped to the affected module or file when the tooling supports it, and check whether an existing test exercises the changed lines or branches and still passes.
   - When coverage already exists and is green, note it under that comment in the analysis file (for example "Test coverage: covered by `<test file>`") — no test change is needed.
   - When coverage is missing, a test now fails, or the comment specifically requested a test, draft the minimal test addition or update, following the style, framework, and conventions of the existing test files. As with any other change, record it in the analysis file as a proposed diff and wait for explicit approval before creating or editing the test file. Do not add tests speculatively beyond what the change requires.
   - When no test tooling exists for the affected module, say so in the analysis file instead of guessing one.

10. **Post only what is approved, and only after a separate, explicit approval to post** (approval to change code does not imply approval to post replies, and the reverse also holds). Write the exact approved reply text to a temp file, then:
    - Inline review comment → threaded reply: `node scripts/post-inline-reply.mjs <owner/repo> <pr-number> <comment-id> <body-file>`
    - General PR-level comment: `node scripts/post-general-comment.mjs <owner/repo> <pr-number> <body-file>`

## Reply Rules (apply at every verbosity level)

- No pleasantries, thanks, praise, or hedging — nothing like "Thanks for catching this," "Great point," or "I think maybe." State facts only.
- No first person and no filler. Short, direct, robotic statements.
- Every reply opens with exactly one status:
  - `Resolved.` — clarified or already satisfied without a code change.
  - `Done.` — a code change was made as requested.
  - `Not required: <reason>.` — no change made; the reason is mandatory and must be concrete (for example "Not required: already validated at line 42." rather than "Not required: not needed.").

## Verbosity Levels

- **minimal (default)** — status line only.
  - `Done.`
  - `Not required: out of scope for this PR.`
- **concise** — status plus one short clause saying what or why.
  - `Done. Added null check before dereferencing region.`
  - `Not required: duplicate of comment #3.`
- **standard** — status plus a one- to two-sentence explanation of the change made or the reasoning for rejecting it.
- **detailed** — status plus a full explanation: what changed and where, or (for "Not required") the complete reasoning and any alternative considered.

## Analysis File Template

````markdown
# PR #<number> Comment Analysis

Generated: <date>

## Comment <n> — <file>:<line> (<author>)

> <quoted comment text>

**Classification:** Actionable / Addressable without code change / Not required

**Analysis:** <what is being asked, whether it is valid, root cause where relevant>

**Decision:** Resolved / Done / Not required — <reason, mandatory when Not required>

**Proposed change:** (omit this block when there is none)
```diff
<minimal diff satisfying exactly this comment>
```

**Test coverage:** (fill in after the change above is applied; omit for non-behavioral changes)
<Covered by `<test file>`, already passing / Not covered — proposed test diff below>
```diff
<minimal test addition/update, if any>
```

**Draft replies:**
- Minimal: ...
- Concise: ...
- Standard: ...
- Detailed: ...

---
````

## Scripts

All paths below are relative to this skill's folder (`.agents/skills/pr-comment-resolver/`). The scripts are plain Node.js using only core modules — no dependencies — so they behave identically on Windows, Linux, and macOS when run as `node <path> ...`; the only external tool they shell out to is `gh`, which is itself cross-platform.

- `scripts/fetch-comments.mjs <pr-number-or-url>` — resolves `owner/repo`, then fetches inline review comments, review summaries, and general comments and prints them as one JSON object on stdout. Read-only; safe to run without approval.
- `scripts/post-inline-reply.mjs <owner/repo> <pr-number> <comment-id> <body-file>` — posts a threaded reply to one inline review comment. Run only after explicit approval to post (step 10).
- `scripts/post-general-comment.mjs <owner/repo> <pr-number> <body-file>` — posts a general PR comment. Run only after explicit approval to post (step 10).

## Hard Rules

1. Never edit, create, or delete a file in response to a PR comment before the user explicitly approves that specific change.
2. Never post or reply to a PR/GitHub comment before the user explicitly approves posting.
3. Approval to change code and approval to post replies are independent — never infer one from the other.
4. Every applied change must stay scoped to exactly what its comment requires — nothing broader.
5. Replies are always status-first, robotic, and free of pleasantries; "Not required" always carries a concrete reason.
6. The analysis markdown file is the single source of truth for what is approved. When the user gives a correction or an explicit change, update the file first, then apply — never apply a change that is not reflected in the approved file.
7. Every behavior-affecting change gets a test-coverage check after it is applied (step 9); a proposed test addition is a change like any other and requires its own explicit approval before it is written.
