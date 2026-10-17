#!/usr/bin/env node
/**
 * @file Creates a pull request from the current branch and prints the pull
 * request URL on stdout. The pull request is always created ready for review;
 * drafts are not supported. The body is never read from or written to a file:
 * provide it inline with --body or on stdin with --body-stdin.
 *
 * Usage:
 *
 *   node scripts/create-pr.mjs --title <title> [--body <markdown> | --body-stdin] [--base <branch>]
 *
 * The branch must already be pushed to the remote; this script never pushes.
 *
 * Write operation: run it only after the user has explicitly reviewed and
 * approved the title, body, and base branch.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const MAX_OUTPUT_BYTES = 100 * 1024 * 1024;
const USAGE =
    'Usage: node scripts/create-pr.mjs --title <title> [--body <markdown> | --body-stdin] [--base <branch>]';

/**
 * Shape of the parsed command-line options.
 *
 * @typedef {object} CreatePrOptions
 * @property {string} title Pull request title.
 * @property {string|undefined} body Inline pull request body, when specified.
 * @property {boolean} bodyFromStdin Whether to read the body from stdin.
 * @property {string|undefined} base Base branch, when specified.
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
 * Parses the supported flags into options.
 *
 * @param {string[]} args Arguments after the script name.
 * @returns {CreatePrOptions}
 */
function parseArguments(args) {
    /** @type {CreatePrOptions} */
    const options = {
        title: '',
        body: undefined,
        bodyFromStdin: false,
        base: undefined,
    };

    for (let index = 0; index < args.length; index += 1) {
        const argument = args[index];

        switch (argument) {
            case '--title':
                options.title = args[index + 1] ?? '';
                index += 1;
                break;
            case '--body':
                options.body = args[index + 1] ?? '';
                index += 1;
                break;
            case '--body-stdin':
                options.bodyFromStdin = true;
                break;
            case '--base':
                options.base = args[index + 1];
                index += 1;
                break;
            default:
                console.error(`Unknown argument: ${argument}`);
                return exitWithUsage();
        }
    }

    if (!options.title) {
        console.error('Missing required option: --title');
        exitWithUsage();
    }

    if (options.body !== undefined && options.bodyFromStdin) {
        console.error('Use only one of --body or --body-stdin');
        exitWithUsage();
    }

    if (options.body === undefined && !options.bodyFromStdin) {
        console.error(
            'Provide the pull request body with --body or --body-stdin',
        );

        exitWithUsage();
    }

    return options;
}

/**
 * Reads the pull request body from stdin and rejects empty input.
 *
 * @returns {string} The body markdown.
 */
function readBodyFromStdin() {
    const body = readFileSync(0, 'utf8');

    if (!body.trim()) {
        console.error('No pull request body received on stdin.');
        process.exit(1);
    }

    return body;
}

const { title, body, bodyFromStdin, base } = parseArguments(
    process.argv.slice(2),
);

const pullRequestBody = bodyFromStdin ? readBodyFromStdin() : body;

if (!pullRequestBody.trim()) {
    console.error('Pull request body must not be empty.');
    process.exit(1);
}

const ghArguments = [
    'pr',
    'create',
    '--title',
    title,
    '--body',
    pullRequestBody,
];

if (base) {
    ghArguments.push('--base', base);
}

const output = execFileSync('gh', ghArguments, {
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
});

console.log(output.trim());
