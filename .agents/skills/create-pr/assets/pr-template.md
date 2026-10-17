# PR Description Template

Copy this template verbatim when writing a PR description — no extra sections, no reordering. Fill
the empty parts per the skill's writing guidelines. The body never contains the title: no
`**Title:**` line, no H1 heading — the title is passed separately to the create/update script.

```markdown
## Description

What does this PR do?

## Changes

-
-
-

## Related Issue

Closes #
```

Notes:

- **Title**: never part of the body. It is set separately as the pull request title (`--title`):
  short, imperative-mood subject line (50 chars or less), format `[type]: short description` — e.g.
  `feat: add rate limiting to auth endpoints`.
- **Description**: 2-4 plain-English sentences on what the PR does and why.
- **Changes**: bullets with action verbs (Add, Fix, Refactor, Remove, Update); one idea per bullet.
- **Related Issue**: `Closes #<issue>` if known, else `Closes #` for the user to fill in.