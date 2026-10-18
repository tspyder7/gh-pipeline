#!/usr/bin/env node
/**
 * @file Fetches the labels configured on a GitHub repository and prints them
 * as a single JSON object on stdout:
 *
 *   { repo, labels: [{ name, description, color }] }
 *
 * Usage:
 *
 *   node scripts/fetch-labels.mjs [owner/repo]
 *
 * With no argument, `owner/repo` is resolved from the current repository.
 *
 * Read-only: this script never creates, edits, or deletes labels.
 */

import { execFileSync } from 'node:child_process';

const MAX_OUTPUT_BYTES = 100 * 1024 * 1024;
const MAX_LABELS = '1000';
const USAGE = 'Usage: node scripts/fetch-labels.mjs [owner/repo]';

/**
 * Shape of one label in the script output.
 *
 * @typedef {object} RepositoryLabel
 * @property {string} name
 * @property {string} description
 * @property {string} color
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
 * Resolves the repository to fetch labels for.
 *
 * @param {string|undefined} repositoryInput `owner/repo` argument, if given.
 * @returns {string} Repository in `owner/repo` form.
 */
function resolveRepository(repositoryInput) {
    if (repositoryInput) {
        if (!/^[^/]+\/[^/]+$/.test(repositoryInput)) {
            console.error(
                `Could not parse owner/repo from: ${repositoryInput}`,
            );

            return exitWithUsage();
        }

        return repositoryInput;
    }

    return runGhCommand([
        'repo',
        'view',
        '--json',
        'nameWithOwner',
        '--jq',
        '.nameWithOwner',
    ]).trim();
}

/**
 * Fetches the labels configured on a repository.
 *
 * @param {string} repository Repository in `owner/repo` form.
 * @returns {Array<Record<string, unknown>>} Raw label objects from `gh`.
 */
function fetchRepositoryLabels(repository) {
    return JSON.parse(
        runGhCommand([
            'label',
            'list',
            '--repo',
            repository,
            '--limit',
            MAX_LABELS,
            '--json',
            'name,description,color',
        ]),
    );
}

/**
 * Maps a raw label from `gh` to the output shape.
 *
 * @param {Record<string, unknown>} rawLabel Raw label from `gh`.
 * @returns {RepositoryLabel}
 */
function toRepositoryLabel(rawLabel) {
    return {
        name: rawLabel.name,
        description: rawLabel.description,
        color: rawLabel.color,
    };
}

const repository = resolveRepository(process.argv[2]);

process.stderr.write(`Fetching labels for ${repository} ...\n`);

const labels = fetchRepositoryLabels(repository).map((rawLabel) =>
    toRepositoryLabel(rawLabel),
);

console.log(JSON.stringify({ repo: repository, labels }, null, 2));
