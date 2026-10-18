import {
    groupCommits,
    parseBody,
    parseCommit,
    parseCommitLog,
    parseHeader,
    renderReleaseNotes,
    resolveBump,
    splitCommitLog,
} from '../../.github/scripts/lib/commit-format.mjs';

import type {
    ParsedCommit,
    RawCommit,
} from '../../.github/scripts/lib/commit-format.mjs';

const createRawCommit = (overrides: Partial<RawCommit> = {}): RawCommit => ({
    hash: 'abc1234',
    subject: 'feat: add thing',
    body: '',
    ...overrides,
});

const createCommit = (overrides: Partial<RawCommit> = {}): ParsedCommit =>
    parseCommit(createRawCommit(overrides));

const encodeLog = (commits: RawCommit[]): string =>
    commits
        .map(
            ({ hash, subject, body }) =>
                `${hash}\x1f${subject}\x1f${body}\x1e\n`,
        )
        .join('');

describe('commit-format', () => {
    describe('parseHeader', () => {
        it('parses conventional commits with scope and breaking marker', () => {
            // Arrange

            // Act
            const header = parseHeader('fix(api)!: drop legacy endpoint');

            // Assert
            expect(header).toEqual({
                story: '',
                type: 'fix',
                scope: 'api',
                breaking: true,
                text: 'drop legacy endpoint',
            });
        });

        it('parses story prefixed conventional commits', () => {
            // Arrange

            // Act
            const header = parseHeader('[PROJ-42] feat(ui): add story support');

            // Assert
            expect(header).toEqual({
                story: 'PROJ-42',
                type: 'feat',
                scope: 'ui',
                breaking: false,
                text: 'add story support',
            });
        });

        it('parses story prefixed commits without a type', () => {
            // Arrange

            // Act
            const header = parseHeader('[PROJ-42] tidy the readme');

            // Assert
            expect(header).toEqual({
                story: 'PROJ-42',
                type: '',
                scope: '',
                breaking: false,
                text: 'tidy the readme',
            });
        });

        it('parses story prefixed commits with a colon separator', () => {
            // Arrange

            // Act
            const header = parseHeader('[PROJ-42]: fix: crash on start');

            // Assert
            expect(header.story).toBe('PROJ-42');
            expect(header.type).toBe('fix');
            expect(header.text).toBe('crash on start');
        });

        it('lowercases the type and keeps plain messages intact', () => {
            // Arrange

            // Act
            const typed = parseHeader('FEAT: shout');
            const plain = parseHeader('update readme');

            // Assert
            expect(typed.type).toBe('feat');
            expect(plain).toEqual({
                story: '',
                type: '',
                scope: '',
                breaking: false,
                text: 'update readme',
            });
        });
    });

    describe('parseBody', () => {
        it('collects bullets and preserves nesting indentation', () => {
            // Arrange
            const body = '- first detail\n  - nested detail\n- second detail';

            // Act
            const { details } = parseBody(body);

            // Assert
            expect(details).toEqual([
                { indent: '', text: 'first detail' },
                { indent: '  ', text: 'nested detail' },
                { indent: '', text: 'second detail' },
            ]);
        });

        it('detects the hyphenated breaking change footer', () => {
            // Arrange

            // Act
            const { breakingNote } = parseBody('BREAKING-CHANGE: api removed');

            // Assert
            expect(breakingNote).toBe('api removed');
        });

        it('detects a breaking footer written as a bullet', () => {
            // Arrange
            const body = '- normal detail\n- BREAKING CHANGE: api changed';

            // Act
            const { details, breakingNote } = parseBody(body);

            // Assert
            expect(details).toEqual([{ indent: '', text: 'normal detail' }]);
            expect(breakingNote).toBe('api changed');
        });

        it('appends continuation lines to the open bullet', () => {
            // Arrange
            const body = '- first detail\n  continued';

            // Act
            const { details } = parseBody(body);

            // Assert
            expect(details).toEqual([
                { indent: '', text: 'first detail continued' },
            ]);
        });

        it('ignores footer lines such as issue references', () => {
            // Arrange

            // Act
            const { details, breakingNote } = parseBody('Refs: #123');

            // Assert
            expect(details).toEqual([]);
            expect(breakingNote).toBe('');
        });
    });

    describe('parseCommit', () => {
        it('marks a commit breaking when the body has a breaking footer', () => {
            // Arrange

            // Act
            const commit = createCommit({
                subject: '[PROJ-7] fix: guard null token',
                body: 'BREAKING CHANGE: sessions are invalidated',
            });

            // Assert
            expect(commit.breaking).toBe(true);
            expect(commit.breakingNote).toBe('sessions are invalidated');
            expect(commit.story).toBe('PROJ-7');
            expect(commit.type).toBe('fix');
        });
    });

    describe('splitCommitLog', () => {
        it('parses records written with the LOG_FORMAT separators', () => {
            // Arrange
            const raw = encodeLog([
                createRawCommit({ hash: 'aaa1111' }),
                createRawCommit({
                    hash: 'bbb2222',
                    subject: '[PROJ-9] fix: thing',
                    body: '- detail',
                }),
            ]);

            // Act
            const commits = splitCommitLog(raw);

            // Assert
            expect(commits).toEqual([
                { hash: 'aaa1111', subject: 'feat: add thing', body: '' },
                {
                    hash: 'bbb2222',
                    subject: '[PROJ-9] fix: thing',
                    body: '- detail',
                },
            ]);
        });

        it('drops the empty record produced by the trailing separator', () => {
            // Arrange
            const raw = encodeLog([createRawCommit()]);

            // Act
            const commits = splitCommitLog(raw);

            // Assert
            expect(commits).toHaveLength(1);
        });
    });

    describe('parseCommitLog', () => {
        it('parses a mixed range of story and conventional commits', () => {
            // Arrange
            const raw = encodeLog([
                createRawCommit({
                    hash: 'aaa1111',
                    subject: '[PROJ-9] feat: story feature',
                }),
                createRawCommit({
                    hash: 'bbb2222',
                    subject: 'fix: plain fix',
                }),
            ]);

            // Act
            const commits = parseCommitLog(raw);

            // Assert
            expect(commits.map((commit) => commit.story)).toEqual([
                'PROJ-9',
                '',
            ]);
            expect(commits.map((commit) => commit.type)).toEqual([
                'feat',
                'fix',
            ]);
        });
    });

    describe('resolveBump', () => {
        it('returns major when any commit in a mixed range is breaking', () => {
            // Arrange
            const commits = [
                createCommit({ subject: '[PROJ-1] feat: safe feature' }),
                createCommit({ subject: 'fix!: drop legacy api' }),
            ];

            // Act
            const bump = resolveBump(commits);

            // Assert
            expect(bump).toBe('major');
        });

        it('returns minor when the range mixes story and conventional feats', () => {
            // Arrange
            const commits = [
                createCommit({ subject: 'chore: tidy' }),
                createCommit({ subject: '[PROJ-2] feat: story feature' }),
            ];

            // Act
            const bump = resolveBump(commits);

            // Assert
            expect(bump).toBe('minor');
        });

        it('returns patch when no feat or breaking commit exists', () => {
            // Arrange
            const commits = [
                createCommit({ subject: '[PROJ-3] chore: tidy' }),
                createCommit({ subject: 'docs: update guide' }),
            ];

            // Act
            const bump = resolveBump(commits);

            // Assert
            expect(bump).toBe('patch');
        });

        it('uses the breaking footer of a story commit', () => {
            // Arrange
            const commits = [
                createCommit({
                    subject: '[PROJ-4] docs: rewrite',
                    body: 'BREAKING-CHANGE: docs moved',
                }),
            ];

            // Act
            const bump = resolveBump(commits);

            // Assert
            expect(bump).toBe('major');
        });
    });

    describe('groupCommits', () => {
        it('routes story and conventional commits into matching sections', () => {
            // Arrange
            const commits = [
                createCommit({ subject: '[PROJ-5] feat: story feature' }),
                createCommit({ subject: 'fix: plain fix' }),
                createCommit({ subject: '[PROJ-5] kitchen sink' }),
                createCommit({ subject: 'docs: guide' }),
            ];

            // Act
            const sections = groupCommits(commits);

            // Assert
            expect(sections.features).toHaveLength(1);
            expect(sections.fixes).toHaveLength(1);
            expect(sections.docs).toHaveLength(1);
            expect(sections.other).toHaveLength(1);
            expect(sections.breaking).toEqual([]);
        });

        it('prioritises breaking commits over their type section', () => {
            // Arrange
            const commits = [
                createCommit({ subject: '[PROJ-6] feat!: breaking feature' }),
            ];

            // Act
            const sections = groupCommits(commits);

            // Assert
            expect(sections.breaking).toHaveLength(1);
            expect(sections.features).toEqual([]);
        });
    });

    describe('renderReleaseNotes', () => {
        it('groups entries per story and keeps scope and nested details', () => {
            // Arrange
            const commits = [
                parseCommit({
                    hash: 'abc1234',
                    subject: '[PROJ-8] feat(ui): add panel',
                    body: '- renders panel\n  - keeps state\n- adds tests',
                }),
                parseCommit({
                    hash: 'def5678',
                    subject: 'feat: storyless panel flag',
                }),
            ];

            // Act
            const notes = renderReleaseNotes({
                repo: 'acme/app',
                prevTag: 'v1.0.0',
                nextTag: 'v1.1.0',
                commits,
                releasedAt: '2026-10-18T19:43:23.123Z',
            });

            // Assert
            expect(notes).toContain('### ✨ Features');
            expect(notes).toContain('#### PROJ-8');
            expect(notes).toContain(
                '- **ui:** add panel ([`abc1234`](https://github.com/acme/app/commit/abc1234))',
            );
            expect(notes).toContain('  - renders panel');
            expect(notes).toContain('    - keeps state');
            expect(notes).toContain('  - adds tests');
            expect(notes).toContain(
                '- storyless panel flag ([`def5678`](https://github.com/acme/app/commit/def5678))',
            );
            expect(notes).toContain(
                '**Full Changelog**: [`v1.0.0...v1.1.0`](https://github.com/acme/app/compare/v1.0.0...v1.1.0)',
            );
            expect(notes).toContain(
                '**Released (UTC)**: `2026-10-18T19:43:23Z`',
            );
        });

        it('collects the same story from different sections under its own heading', () => {
            // Arrange
            const commits = [
                parseCommit({
                    hash: 'aaa1111',
                    subject: '[PROJ-9] feat: first story feature',
                }),
                parseCommit({
                    hash: 'bbb2222',
                    subject: 'fix: plain fix',
                }),
                parseCommit({
                    hash: 'ccc3333',
                    subject: '[PROJ-9] fix: second story fix',
                }),
            ];

            // Act
            const notes = renderReleaseNotes({
                repo: 'acme/app',
                nextTag: 'v1.0.0',
                commits,
            });

            // Assert
            expect(notes).toContain('### ✨ Features');
            expect(notes).toContain('### 🐛 Bug Fixes');
            expect(notes).toContain('#### PROJ-9');
            expect(notes).not.toContain('- [PROJ-9]');
        });

        it('places mixed format commits into their own sections', () => {
            // Arrange
            const commits = [
                parseCommit({
                    hash: 'aaa1111',
                    subject: '[PROJ-10] feat: story feature',
                }),
                parseCommit({
                    hash: 'bbb2222',
                    subject: 'fix: plain fix',
                    body: 'BREAKING CHANGE: api changed',
                }),
            ];

            // Act
            const notes = renderReleaseNotes({
                repo: 'acme/app',
                prevTag: '',
                nextTag: 'v1.0.0',
                commits,
            });

            // Assert
            expect(notes).toContain('### ⚠️ Breaking Changes');
            expect(notes).toContain('**BREAKING CHANGE:** api changed');
            expect(notes).toContain('### ✨ Features');
            expect(notes).toContain('#### PROJ-10');
            expect(notes).toContain('- story feature');
            expect(notes).not.toContain('### 🐛 Bug Fixes');
            expect(notes).toContain(
                '**Full Changelog**: [`v1.0.0`](https://github.com/acme/app/commits/v1.0.0)',
            );
        });

        it('omits empty sections and handles plain messages', () => {
            // Arrange
            const commits = [parseCommit({ hash: 'ccc3333', subject: 'tidy' })];

            // Act
            const notes = renderReleaseNotes({
                repo: 'acme/app',
                nextTag: 'v1.0.0',
                commits,
            });

            // Assert
            expect(notes).toContain('### 🧰 Other Changes');
            expect(notes).toContain('- tidy');
            expect(notes).not.toContain('### ✨ Features');
            expect(notes).not.toContain('### 🐛 Bug Fixes');
        });
    });
});
