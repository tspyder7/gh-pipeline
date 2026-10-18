#!/usr/bin/env node
/**
 * @file Posts a threaded reply to one inline pull request review comment.
 *
 * Usage:
 *
 *   node scripts/post-inline-reply.mjs <owner/repo> <pr-number> <comment-id> <body-file>
 *
 * Write operation: run it only after the user has explicitly approved the
 * reply text.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const USAGE =
    'Usage: node scripts/post-inline-reply.mjs <owner/repo> <pr-number> <comment-id> <body-file>';

/**
 * Prints the usage message to stderr and exits with code 1.
 *
 * @returns {never}
 */
function exitWithUsage() {
    console.error(USAGE);
    process.exit(1);
}

const [repository, pullRequestNumber, commentId, bodyFile] =
    process.argv.slice(2);

if (!repository || !pullRequestNumber || !commentId || !bodyFile) {
    exitWithUsage();
}

if (!existsSync(bodyFile)) {
    console.error(`Body file not found: ${bodyFile}`);
    process.exit(1);
}

// -F (typed field) is required here: with it, `body=@<file>` makes `gh` read
// the file's contents. The lowercase -f (raw field) would send the literal
// string "@<file>" instead.
execFileSync(
    'gh',
    [
        'api',
        `repos/${repository}/pulls/${pullRequestNumber}/comments/${commentId}/replies`,
        '-F',
        `body=@${bodyFile}`,
    ],
    { stdio: 'inherit' },
);
