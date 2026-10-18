#!/usr/bin/env node
/**
 * @file Updates the title, body, or base branch of an existing pull request.
 * The body is never read from or written to a file: provide it inline with
 * --body or on stdin with --body-stdin.
 *
 * Usage:
 *
 *   node scripts/update-pr.mjs <pr-number> [--title <title>] [--body <markdown> | --body-stdin] [--base <branch>]
 *
 * At least one of --title, --body, --body-stdin, or --base is required.
 *
 * Write operation: run it only after the user has explicitly reviewed and
 * approved the updated title, body, and base branch.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const MAX_OUTPUT_BYTES = 100 * 1024 * 1024;
const USAGE =
    'Usage: node scripts/update-pr.mjs <pr-number> [--title <title>] [--body <markdown> | --body-stdin] [--base <branch>]';

/**
 * Shape of the parsed command-line options.
 *
 * @typedef {object} UpdatePrOptions
 * @property {string} pullRequestNumber Pull request number.
 * @property {string} title New title, when specified.
 * @property {string|undefined} body Inline new body, when specified.
 * @property {boolean} bodyFromStdin Whether to read the new body from stdin.
 * @property {string|undefined} base New base branch, when specified.
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
 * Parses the pull request number and supported flags into options.
 *
 * @param {string[]} args Arguments after the script name.
 * @returns {UpdatePrOptions}
 */
function parseArguments(args) {
    const rawNumber = args[0] ?? '';
    const pullRequestNumber = rawNumber.replace(/^#/, '');

    if (!/^\d+$/.test(pullRequestNumber)) {
        console.error(
            `Could not parse a pull request number from: ${rawNumber}`,
        );
        return exitWithUsage();
    }

    /** @type {UpdatePrOptions} */
    const options = {
        pullRequestNumber,
        title: '',
        body: undefined,
        bodyFromStdin: false,
        base: undefined,
    };

    for (let index = 1; index < args.length; index += 1) {
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

    if (
        !options.title &&
        options.body === undefined &&
        !options.bodyFromStdin &&
        !options.base
    ) {
        console.error(
            'Provide at least one of --title, --body, --body-stdin, or --base',
        );

        return exitWithUsage();
    }

    if (options.body !== undefined && options.bodyFromStdin) {
        console.error('Use only one of --body or --body-stdin');
        exitWithUsage();
    }

    return options;
}

/**
 * Reads the new pull request body from stdin and rejects empty input.
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

const { pullRequestNumber, title, body, bodyFromStdin, base } = parseArguments(
    process.argv.slice(2),
);

const ghArguments = ['pr', 'edit', pullRequestNumber];

if (title) {
    ghArguments.push('--title', title);
}

if (bodyFromStdin) {
    ghArguments.push('--body', readBodyFromStdin());
} else if (body !== undefined) {
    if (!body.trim()) {
        console.error('Pull request body must not be empty.');
        process.exit(1);
    }

    ghArguments.push('--body', body);
}

if (base) {
    ghArguments.push('--base', base);
}

execFileSync('gh', ghArguments, {
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
});

console.log(`Updated pull request #${pullRequestNumber}.`);
