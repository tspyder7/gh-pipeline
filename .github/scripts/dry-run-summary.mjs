#!/usr/bin/env node

import { appendFileSync } from 'node:fs';

const prevTag = process.env.PREV_TAG ?? '';
const nextTag = process.env.NEXT_TAG ?? '';
const bump = process.env.BUMP ?? '';

const summary = `### Dry run

- Previous tag: \`${prevTag || 'none'}\`
- Tag that would be created: \`${nextTag}\`
- Bump: \`${bump}\`
- No tag or release was created
`;

if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
} else {
    console.log(summary);
}
