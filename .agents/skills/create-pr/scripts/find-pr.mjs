#!/usr/bin/env node
/**
 * @file Finds the repository, default base branch, and open pull request, if
 * any, for a local branch. Prints a single JSON object on stdout:
 *
 *   { repo, branch, defaultBase, openPullRequest }
 *
 * Usage:
 *
 *   node scripts/find-pr.mjs [branch]
 *
 * With no argument, the current checked-out branch is used. `openPullRequest`
 * is null when the branch has no open pull request.
 *
 * Read-only: this script never creates, edits, or closes anything on GitHub.
 */

import { execFileSync } from 'node:child_process';

const MAX_OUTPUT_BYTES = 100 * 1024 * 1024;
const USAGE = 'Usage: node scripts/find-pr.mjs [branch]';

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
 * Resolves the repository and default branch of the current working
 * directory.
 *
 * @returns {{ repository: string, defaultBase: string }} Repository in
 * `owner/repo` form and its default branch name.
 */
function resolveRepositoryInfo() {
    const repositoryInfo = JSON.parse(
        runGhCommand([
            'repo',
            'view',
            '--json',
            'nameWithOwner,defaultBranchRef',
        ]),
    );

    return {
        repository: repositoryInfo.nameWithOwner,
        defaultBase: repositoryInfo.defaultBranchRef.name,
    };
}

/**
 * Resolves the local branch to look up.
 *
 * @param {string|undefined} branchInput Branch argument, if given.
 * @returns {string} Branch name.
 */
function resolveBranch(branchInput) {
    if (branchInput) {
        return branchInput;
    }

    const branch = execFileSync('git', ['branch', '--show-current'], {
        encoding: 'utf8',
    }).trim();

    if (!branch) {
        console.error(
            'Could not determine the current branch (detached HEAD?).',
        );

        return exitWithUsage();
    }

    return branch;
}

/**
 * Finds the open pull request for a branch, if one exists.
 *
 * @param {string} repository Repository in `owner/repo` form.
 * @param {string} branch Branch name.
 * @returns {Record<string, unknown>|null} The open pull request or null.
 */
function findOpenPullRequest(repository, branch) {
    const [owner] = repository.split('/');

    const pullRequests = JSON.parse(
        runGhCommand([
            'pr',
            'list',
            '--repo',
            repository,
            '--head',
            `${owner}:${branch}`,
            '--state',
            'open',
            '--limit',
            '1',
            '--json',
            'number,title,url,isDraft,baseRefName',
        ]),
    );

    return pullRequests[0] ?? null;
}

const { repository, defaultBase } = resolveRepositoryInfo();
const branch = resolveBranch(process.argv[2]);

process.stderr.write(
    `Looking for an open pull request for ${repository}:${branch} ...\n`,
);

console.log(
    JSON.stringify(
        {
            repo: repository,
            branch,
            defaultBase,
            openPullRequest: findOpenPullRequest(repository, branch),
        },
        null,
        2,
    ),
);
