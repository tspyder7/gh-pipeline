#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const fail = (message) => {
    console.error(`::error::${message}`);
    process.exit(1);
};

const tag = process.env.NEXT_TAG ?? '';
const notesFile = process.env.NOTES_FILE ?? '';

if (!tag || !notesFile) {
    fail('NEXT_TAG and NOTES_FILE environment variables are required');
}

const { status } = spawnSync(
    'gh',
    [
        'release',
        'create',
        tag,
        '--verify-tag',
        '--title',
        tag,
        '--notes-file',
        notesFile,
    ],
    { stdio: 'inherit' },
);

if (status !== 0) {
    fail(`Failed to create release '${tag}'`);
}

console.log(`Created release ${tag}`);
