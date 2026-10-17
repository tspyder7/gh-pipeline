#!/usr/bin/env node
/**
 * @file Closes a pull request. The pull request's branch is left untouched.
 *
 * Usage:
 *
 *   node scripts/close-pr.mjs <pr-number>
 *
 * Write operation: run it only after the user has explicitly approved closing
 * the pull request.
 */

import { execFileSync } from 'node:child_process';

const USAGE = 'Usage: node scripts/close-pr.mjs <pr-number>';

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

if (!rawNumber) {
    exitWithUsage();
}

const pullRequestNumber = rawNumber.replace(/^#/, '');

if (!/^\d+$/.test(pullRequestNumber)) {
    console.error(`Could not parse a pull request number from: ${rawNumber}`);
    exitWithUsage();
}

execFileSync('gh', ['pr', 'close', pullRequestNumber], { stdio: 'inherit' });

console.log(
    `Closed pull request #${pullRequestNumber}. The branch was not deleted.`,
);
