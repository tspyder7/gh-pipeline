#!/usr/bin/env node
/**
 * @file Posts a general, non-inline comment to a pull request.
 *
 * Usage:
 *
 *   node scripts/post-general-comment.mjs <owner/repo> <pr-number> <body-file>
 *
 * Write operation: run it only after the user has explicitly approved the
 * reply text.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const USAGE =
    'Usage: node scripts/post-general-comment.mjs <owner/repo> <pr-number> <body-file>';

/**
 * Prints the usage message to stderr and exits with code 1.
 *
 * @returns {never}
 */
function exitWithUsage() {
    console.error(USAGE);
    process.exit(1);
}

const [repository, pullRequestNumber, bodyFile] = process.argv.slice(2);

if (!repository || !pullRequestNumber || !bodyFile) {
    exitWithUsage();
}

if (!existsSync(bodyFile)) {
    console.error(`Body file not found: ${bodyFile}`);
    process.exit(1);
}

execFileSync(
    'gh',
    [
        'pr',
        'comment',
        pullRequestNumber,
        '--repo',
        repository,
        '--body-file',
        bodyFile,
    ],
    { stdio: 'inherit' },
);
