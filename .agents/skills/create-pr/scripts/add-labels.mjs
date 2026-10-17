#!/usr/bin/env node
/**
 * @file Adds labels to a pull request. Existing labels are never removed.
 *
 * Usage:
 *
 *   node scripts/add-labels.mjs <pr-number> <label1,label2,...>
 *
 * Write operation: run it only after the user has explicitly reviewed and
 * approved the label list.
 */

import { execFileSync } from 'node:child_process';

const MAX_OUTPUT_BYTES = 100 * 1024 * 1024;
const USAGE =
    'Usage: node scripts/add-labels.mjs <pr-number> <label1,label2,...>';

/**
 * Prints the usage message to stderr and exits with code 1.
 *
 * @returns {never}
 */
function exitWithUsage() {
    console.error(USAGE);
    process.exit(1);
}

const rawNumber = process.argv[2];
const rawLabels = process.argv[3];

if (!rawNumber || !rawLabels) {
    exitWithUsage();
}

const pullRequestNumber = rawNumber.replace(/^#/, '');

if (!/^\d+$/.test(pullRequestNumber)) {
    console.error(`Could not parse a pull request number from: ${rawNumber}`);
    exitWithUsage();
}

const labels = rawLabels
    .split(',')
    .map((label) => label.trim())
    .filter((label) => label.length > 0);

if (labels.length === 0) {
    console.error('No labels provided.');
    exitWithUsage();
}

const ghArguments = ['pr', 'edit', pullRequestNumber];

for (const label of labels) {
    ghArguments.push('--add-label', label);
}

execFileSync('gh', ghArguments, {
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
});

console.log(
    `Added labels to pull request #${pullRequestNumber}: ${labels.join(', ')}`,
);
