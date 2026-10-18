#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

import {
    LOG_FORMAT,
    parseCommitLog,
    resolveBump,
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

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const branch = process.env.INPUT_BRANCH ?? '';
const tagPrefix = process.env.INPUT_TAG_PREFIX ?? 'v';
const bumpInput = process.env.INPUT_BUMP ?? 'auto';

if (!['auto', 'major', 'minor', 'patch'].includes(bumpInput)) {
    fail(`Invalid bump '${bumpInput}', expected auto, major, minor or patch`);
}

const tagPattern = new RegExp(
    `^${escapeRegExp(tagPrefix)}(\\d+)\\.(\\d+)\\.(\\d+)$`,
);
const candidatePattern = new RegExp(`^${escapeRegExp(tagPrefix)}\\d`);

const tags = git('tag', '--merged', 'HEAD', '--sort=-v:refname')
    .split('\n')
    .filter(Boolean);

let previousTag = '';
let previousVersion = null;

for (const tag of tags) {
    const match = tag.match(tagPattern);

    if (match) {
        previousTag = tag;
        previousVersion = {
            major: Number(match[1]),
            minor: Number(match[2]),
            patch: Number(match[3]),
        };
        break;
    }

    if (candidatePattern.test(tag)) {
        fail(`Tag '${tag}' is not a semver tag after prefix '${tagPrefix}'`);
    }
}

let nextTag = '';
let bumpKind = 'initial';

if (!previousTag) {
    nextTag = `${tagPrefix}1.0.0`;

    console.log(
        `No previous tag found, using ${nextTag} for the first release`,
    );
} else {
    const range = `${previousTag}..HEAD`;
    const commitCount = Number(
        git('rev-list', '--no-merges', '--count', range),
    );

    if (commitCount === 0) {
        fail(
            `No new commits on '${branch}' since '${previousTag}', nothing to release`,
        );
    }

    if (bumpInput !== 'auto') {
        bumpKind = bumpInput;
    } else {
        // Same commit set as the release notes: no-merge commits on the range.
        // The lib understands both conventional and "[STORY-1] type:" headers.
        const commits = parseCommitLog(
            git('log', '--no-merges', `--format=${LOG_FORMAT}`, range),
        );

        bumpKind = resolveBump(commits);
    }

    const { major, minor, patch } = previousVersion;

    if (bumpKind === 'major') {
        nextTag = `${tagPrefix}${major + 1}.0.0`;
    } else if (bumpKind === 'minor') {
        nextTag = `${tagPrefix}${major}.${minor + 1}.0`;
    } else {
        nextTag = `${tagPrefix}${major}.${minor}.${patch + 1}`;
    }
}

let tagExists = false;

try {
    execFileSync(
        'git',
        ['rev-parse', '--verify', '--quiet', `refs/tags/${nextTag}`],
        { stdio: 'ignore' },
    );
    tagExists = true;
} catch {
    tagExists = false;
}

if (tagExists) {
    fail(`Tag '${nextTag}' already exists`);
}

setOutput('prev_tag', previousTag);
setOutput('next_tag', nextTag);
setOutput('bump', bumpKind);

console.log(`Previous tag: ${previousTag || 'none'}`);
console.log(`Next tag: ${nextTag} (${bumpKind} bump)`);
