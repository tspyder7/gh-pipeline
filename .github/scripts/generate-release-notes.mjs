#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
    LOG_FORMAT,
    parseCommitLog,
    renderReleaseNotes,
} from './lib/commit-format.mjs';

const fail = (message) => {
    console.error(`::error::${message}`);
    process.exit(1);
};

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

const setOutput = (name, value) => {
    if (process.env.GITHUB_OUTPUT) {
        appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
        return;
    }

    console.log(`[output] ${name}=${value}`);
};

const repo = process.env.GITHUB_REPOSITORY ?? '';
const prevTag = process.env.PREV_TAG ?? '';
const nextTag = process.env.NEXT_TAG ?? '';

if (!repo || !nextTag) {
    fail('GITHUB_REPOSITORY and NEXT_TAG environment variables are required');
}

const range = prevTag ? `${prevTag}..HEAD` : 'HEAD';

// Both conventional and "[STORY-1] type:" commits are parsed by the lib.
const commits = parseCommitLog(
    git('log', '--no-merges', `--format=${LOG_FORMAT}`, range),
);

const notes = renderReleaseNotes({ repo, prevTag, nextTag, commits });
const notesFile = join(process.env.RUNNER_TEMP ?? tmpdir(), 'release-notes.md');

writeFileSync(notesFile, notes);

if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, notes);
}

setOutput('notes_file', notesFile);

console.log(notes);
