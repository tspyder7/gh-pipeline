import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const scriptsDir = new URL('../../.github/scripts/', import.meta.url);

const tempDirs: string[] = [];

const gitEnv = {
    ...process.env,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
};

const runGit = (cwd: string, args: string[]): string =>
    execFileSync('git', args, { cwd, encoding: 'utf8', env: gitEnv }).trim();

const createRepo = (): string => {
    const directory = mkdtempSync(join(tmpdir(), 'release-scripts-'));

    tempDirs.push(directory);

    runGit(directory, ['init', '-b', 'main']);
    runGit(directory, ['config', 'user.name', 'Release Bot']);
    runGit(directory, ['config', 'user.email', 'bot@example.com']);

    return directory;
};

const commit = (cwd: string, subject: string, body = ''): void => {
    const args = ['commit', '--allow-empty', '-m', subject];

    if (body) {
        args.push('-m', body);
    }

    runGit(cwd, args);
};

const runScript = (
    cwd: string,
    script: string,
    env: Record<string, string>,
): { status: number | null; stderr: string; stdout: string } =>
    spawnSync(process.execPath, [new URL(script, scriptsDir).pathname], {
        cwd,
        encoding: 'utf8',
        env: { ...gitEnv, ...env },
    });

const readOutputs = (path: string): Record<string, string> =>
    Object.fromEntries(
        readFileSync(path, 'utf8')
            .split('\n')
            .filter(Boolean)
            .map((line) => {
                const separatorIndex = line.indexOf('=');

                return [
                    line.slice(0, separatorIndex),
                    line.slice(separatorIndex + 1),
                ];
            }),
    );

describe('release scripts', () => {
    afterEach(() => {
        for (const directory of tempDirs) {
            rmSync(directory, { recursive: true, force: true });
        }

        tempDirs.length = 0;
    });

    describe('compute-version', () => {
        it('derives a minor bump from a range mixing both commit formats', () => {
            // Arrange
            const repo = createRepo();
            const outputsFile = join(repo, 'outputs.txt');

            commit(repo, 'chore: initial commit');
            runGit(repo, ['tag', '-a', 'v1.0.0', '-m', 'v1.0.0']);
            commit(repo, '[PROJ-1] feat: add story parsing');
            commit(repo, 'fix: correct header regex');

            // Act
            const result = runScript(repo, 'compute-version.mjs', {
                GITHUB_OUTPUT: outputsFile,
                INPUT_BRANCH: 'main',
                INPUT_TAG_PREFIX: 'v',
                INPUT_BUMP: 'auto',
            });

            // Assert
            expect(result.status).toBe(0);
            expect(readOutputs(outputsFile)).toEqual({
                prev_tag: 'v1.0.0',
                next_tag: 'v1.1.0',
                bump: 'minor',
            });
        });

        it('derives a major bump from a story commit with a breaking footer', () => {
            // Arrange
            const repo = createRepo();
            const outputsFile = join(repo, 'outputs.txt');

            commit(repo, 'chore: initial commit');
            runGit(repo, ['tag', '-a', 'v1.0.0', '-m', 'v1.0.0']);
            commit(
                repo,
                '[PROJ-2] fix: guard null token',
                'BREAKING CHANGE: sessions are invalidated',
            );

            // Act
            const result = runScript(repo, 'compute-version.mjs', {
                GITHUB_OUTPUT: outputsFile,
                INPUT_BRANCH: 'main',
                INPUT_TAG_PREFIX: 'v',
                INPUT_BUMP: 'auto',
            });

            // Assert
            expect(result.status).toBe(0);
            expect(readOutputs(outputsFile)).toEqual({
                prev_tag: 'v1.0.0',
                next_tag: 'v2.0.0',
                bump: 'major',
            });
        });

        it('derives a patch bump when no feat or breaking commit exists', () => {
            // Arrange
            const repo = createRepo();
            const outputsFile = join(repo, 'outputs.txt');

            commit(repo, 'chore: initial commit');
            runGit(repo, ['tag', '-a', 'v1.0.0', '-m', 'v1.0.0']);
            commit(repo, '[PROJ-3] chore: tidy');
            commit(repo, 'docs: update guide');

            // Act
            const result = runScript(repo, 'compute-version.mjs', {
                GITHUB_OUTPUT: outputsFile,
                INPUT_BRANCH: 'main',
                INPUT_TAG_PREFIX: 'v',
                INPUT_BUMP: 'auto',
            });

            // Assert
            expect(result.status).toBe(0);
            expect(readOutputs(outputsFile)).toEqual({
                prev_tag: 'v1.0.0',
                next_tag: 'v1.0.1',
                bump: 'patch',
            });
        });

        it('fails when the range has no commits since the previous tag', () => {
            // Arrange
            const repo = createRepo();
            const outputsFile = join(repo, 'outputs.txt');

            commit(repo, 'chore: initial commit');
            runGit(repo, ['tag', '-a', 'v1.0.0', '-m', 'v1.0.0']);

            // Act
            const result = runScript(repo, 'compute-version.mjs', {
                GITHUB_OUTPUT: outputsFile,
                INPUT_BRANCH: 'main',
                INPUT_TAG_PREFIX: 'v',
                INPUT_BUMP: 'auto',
            });

            // Assert
            expect(result.status).toBe(1);
            expect(result.stderr).toContain('nothing to release');
        });
    });

    describe('generate-release-notes', () => {
        it('renders story ids, body details and breaking changes together', () => {
            // Arrange
            const repo = createRepo();
            const runnerTemp = mkdtempSync(join(tmpdir(), 'runner-temp-'));

            tempDirs.push(runnerTemp);

            commit(repo, 'chore: initial commit');
            runGit(repo, ['tag', '-a', 'v1.0.0', '-m', 'v1.0.0']);
            commit(
                repo,
                '[PROJ-4] feat: story feature',
                '- detail one\n  - nested detail',
            );
            commit(repo, 'fix: plain fix', '- BREAKING CHANGE: api changed');

            // Act
            const result = runScript(repo, 'generate-release-notes.mjs', {
                GITHUB_REPOSITORY: 'acme/app',
                PREV_TAG: 'v1.0.0',
                NEXT_TAG: 'v1.1.0',
                RUNNER_TEMP: runnerTemp,
            });

            // Assert
            expect(result.status).toBe(0);

            const notes = readFileSync(
                join(runnerTemp, 'release-notes.md'),
                'utf8',
            );

            expect(notes).toContain('### ⚠️ Breaking Changes');
            expect(notes).toContain('**BREAKING CHANGE:** api changed');
            expect(notes).toContain('### ✨ Features');
            expect(notes).toContain('#### PROJ-4');
            expect(notes).toContain('- story feature');
            expect(notes).toContain('  - detail one');
            expect(notes).toContain('    - nested detail');
            expect(notes).toContain('- plain fix');
            expect(notes).toContain(
                '**Full Changelog**: [`v1.0.0...v1.1.0`](https://github.com/acme/app/compare/v1.0.0...v1.1.0)',
            );
            expect(notes).toMatch(
                /\*\*Released \(UTC\)\*\*: `\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z`/,
            );
        });

        it('fails when required environment variables are missing', () => {
            // Arrange
            const repo = createRepo();

            commit(repo, 'feat: add thing');

            // Act
            const result = runScript(repo, 'generate-release-notes.mjs', {
                NEXT_TAG: 'v1.0.0',
            });

            // Assert
            expect(result.status).toBe(1);
            expect(result.stderr).toContain(
                'GITHUB_REPOSITORY and NEXT_TAG environment variables are required',
            );
        });
    });
});
