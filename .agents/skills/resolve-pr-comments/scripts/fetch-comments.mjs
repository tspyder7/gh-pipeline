#!/usr/bin/env node
/**
 * @file Fetches the review conversation for one pull request and prints it as
 * a single JSON object on stdout:
 *
 *   { repo, pr_number, inline_comments, reviews, general_comments }
 *
 * Usage:
 *
 *   node scripts/fetch-comments.mjs <pr-number-or-url>
 *
 * The input can be a full GitHub pull request URL or a bare PR number; when a
 * bare number is given, `owner/repo` is resolved from the current repository.
 *
 * Read-only: this script never posts, edits, or deletes anything on GitHub.
 */

import { execFileSync } from 'node:child_process';

const MAX_OUTPUT_BYTES = 100 * 1024 * 1024;
const USAGE = 'Usage: node scripts/fetch-comments.mjs <pr-number-or-url>';

/**
 * Shape of one inline review comment in the script output.
 *
 * @typedef {object} InlineComment
 * @property {number} id
 * @property {string} path
 * @property {number|null} line
 * @property {string} diff_hunk
 * @property {string|null} author
 * @property {string} body
 * @property {string} url
 * @property {number|null} in_reply_to_id
 */

/**
 * Shape of one review summary in the script output.
 *
 * @typedef {object} ReviewSummary
 * @property {number} id
 * @property {string|null} author
 * @property {string} state
 * @property {string} body
 * @property {string} submitted_at
 */

/**
 * Shape of one general PR-level comment in the script output.
 *
 * @typedef {object} GeneralComment
 * @property {number} id
 * @property {string|null} author
 * @property {string} body
 * @property {string} createdAt
 */

/**
 * Prints the usage message to stderr and exits with code 1.
 *
 * @returns {never}
 */
function exitWithUsage() {
    console.error(USAGE);
    process.exit(1);
}

/**
 * Runs one `gh` subcommand and returns its stdout.
 *
 * @param {string[]} ghArguments Arguments for the `gh` CLI.
 * @returns {string} The command's stdout.
 */
function runGhCommand(ghArguments) {
    return execFileSync('gh', ghArguments, {
        encoding: 'utf8',
        maxBuffer: MAX_OUTPUT_BYTES,
    });
}

/**
 * Fetches every page of a paginated GitHub API path.
 *
 * `gh api --paginate` emits one JSON array per page; `--slurp` wraps those
 * pages in one outer array, so flattening always yields the complete item
 * list regardless of how many pages were fetched.
 *
 * @param {string} apiPath GitHub REST API path, for example
 * `repos/owner/repo/pulls/1/comments`.
 * @returns {Array<Record<string, unknown>>} Every item across every page.
 */
function fetchPaginatedItems(apiPath) {
    const responsePages = JSON.parse(
        runGhCommand(['api', apiPath, '--paginate', '--slurp']),
    );

    return responsePages.flat();
}

/**
 * Resolves the repository and pull request number from a PR URL or number.
 *
 * @param {string} pullRequestInput Pull request URL or bare PR number.
 * @returns {{ repository: string, pullRequestNumber: string }} Resolved
 * reference.
 */
function resolvePullRequestReference(pullRequestInput) {
    // Accepts both /pull/<n> (web URL) and /pulls/<n> (API-style URL).
    const urlMatch = pullRequestInput.match(
        /github\.com\/([^/]+)\/([^/]+)\/pulls?\/(\d+)/,
    );

    if (urlMatch) {
        return {
            repository: `${urlMatch[1]}/${urlMatch[2]}`,
            pullRequestNumber: urlMatch[3],
        };
    }

    if (/^\d+$/.test(pullRequestInput)) {
        const repository = runGhCommand([
            'repo',
            'view',
            '--json',
            'nameWithOwner',
            '--jq',
            '.nameWithOwner',
        ]).trim();

        return { repository, pullRequestNumber: pullRequestInput };
    }

    console.error(
        `Could not parse a pull request number from: ${pullRequestInput}`,
    );

    return exitWithUsage();
}

/**
 * Maps a raw inline comment from the GitHub API to the output shape.
 *
 * @param {Record<string, unknown>} rawComment Raw comment from the API.
 * @returns {InlineComment}
 */
function toInlineComment(rawComment) {
    return {
        id: rawComment.id,
        path: rawComment.path,
        line: rawComment.line ?? rawComment.original_line,
        diff_hunk: rawComment.diff_hunk,
        author: rawComment.user?.login,
        body: rawComment.body,
        url: rawComment.html_url,
        in_reply_to_id: rawComment.in_reply_to_id ?? null,
    };
}

/**
 * Maps a raw review from the GitHub API to the output shape.
 *
 * @param {Record<string, unknown>} rawReview Raw review from the API.
 * @returns {ReviewSummary}
 */
function toReviewSummary(rawReview) {
    return {
        id: rawReview.id,
        author: rawReview.user?.login,
        state: rawReview.state,
        body: rawReview.body,
        submitted_at: rawReview.submitted_at,
    };
}

/**
 * Maps a raw general comment from the GitHub API to the output shape.
 *
 * @param {Record<string, unknown>} rawComment Raw comment from the API.
 * @returns {GeneralComment}
 */
function toGeneralComment(rawComment) {
    return {
        id: rawComment.id,
        author: rawComment.author?.login,
        body: rawComment.body,
        createdAt: rawComment.createdAt,
    };
}

/**
 * Fetches the inline review comments for a pull request.
 *
 * @param {string} repository Repository in `owner/repo` form.
 * @param {string} pullRequestNumber Pull request number.
 * @returns {InlineComment[]}
 */
function fetchInlineComments(repository, pullRequestNumber) {
    return fetchPaginatedItems(
        `repos/${repository}/pulls/${pullRequestNumber}/comments`,
    ).map((rawComment) => toInlineComment(rawComment));
}

/**
 * Fetches the review summaries for a pull request.
 *
 * @param {string} repository Repository in `owner/repo` form.
 * @param {string} pullRequestNumber Pull request number.
 * @returns {ReviewSummary[]}
 */
function fetchReviewSummaries(repository, pullRequestNumber) {
    return fetchPaginatedItems(
        `repos/${repository}/pulls/${pullRequestNumber}/reviews`,
    ).map((rawReview) => toReviewSummary(rawReview));
}

/**
 * Fetches the general PR-level comments for a pull request.
 *
 * @param {string} repository Repository in `owner/repo` form.
 * @param {string} pullRequestNumber Pull request number.
 * @returns {GeneralComment[]}
 */
function fetchGeneralComments(repository, pullRequestNumber) {
    const response = JSON.parse(
        runGhCommand([
            'pr',
            'view',
            pullRequestNumber,
            '--repo',
            repository,
            '--json',
            'comments',
        ]),
    );

    return response.comments.map((rawComment) => toGeneralComment(rawComment));
}

const pullRequestInput = process.argv[2];

if (!pullRequestInput) {
    exitWithUsage();
}

const { repository, pullRequestNumber } =
    resolvePullRequestReference(pullRequestInput);

process.stderr.write(
    `Fetching comments for ${repository}#${pullRequestNumber} ...\n`,
);

console.log(
    JSON.stringify(
        {
            repo: repository,
            pr_number: Number(pullRequestNumber),
            inline_comments: fetchInlineComments(repository, pullRequestNumber),
            reviews: fetchReviewSummaries(repository, pullRequestNumber),
            general_comments: fetchGeneralComments(
                repository,
                pullRequestNumber,
            ),
        },
        null,
        2,
    ),
);
