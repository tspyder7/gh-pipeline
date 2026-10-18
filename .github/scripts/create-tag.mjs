#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

const fail = (message) => {
    console.error(`::error::${message}`);
    process.exit(1);
};

const tag = process.env.NEXT_TAG ?? '';

if (!tag) {
    fail('NEXT_TAG environment variable is required');
}

execFileSync('git', ['config', 'user.name', 'github-actions[bot]']);
execFileSync('git', [
    'config',
    'user.email',
    '41898282+github-actions[bot]@users.noreply.github.com',
]);

execFileSync('git', ['tag', '--annotate', tag, '--message', `Release ${tag}`]);
execFileSync('git', ['push', 'origin', tag], { stdio: 'inherit' });

console.log(`Pushed tag ${tag}`);
