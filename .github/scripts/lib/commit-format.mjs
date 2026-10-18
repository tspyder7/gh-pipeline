/**
 * Parsing for the commit formats supported by the release workflow.
 *
 * Supported headers (all optional parts are independent):
 *   - Conventional Commits:  "feat(scope)!: message"
 *   - Story prefixed:        "[PROJ-42] feat: message"
 *   - Story prefixed, no type: "[PROJ-42] message"
 *   - Plain:                 "message"
 *
 * Bodies may contain markdown bullet lists. Those bullets become nested
 * entries in the release notes. A "BREAKING CHANGE:" footer, with or
 * without a hyphen and optionally written as a bullet, marks the commit
 * as breaking regardless of the type.
 */

/** Field separator (\x1f) and record separator (\x1e) keep bodies parseable. */
export const LOG_FORMAT = '%h%x1f%s%x1f%b%x1e';

const STORY_PATTERN = /^\[(?<story>[^\]\s]+)\]\s*(?::\s+)?/;
const TYPE_PATTERN =
    /^(?<type>[a-zA-Z]+)(?:\((?<scope>[^)]*)\))?(?<breaking>!)?:\s+(?<text>.+)$/;
const BREAKING_FOOTER_PATTERN =
    /^(?:[-*]\s+)?BREAKING[ -]CHANGE:\s*(?<note>.*)$/;
const FOOTER_PATTERN = /^[A-Za-z][A-Za-z-]*(?::\s.*|:)$/;
const BULLET_PATTERN = /^(?<indent>[ \t]*)[-*]\s+(?<text>.+)$/;

/**
 * Splits a raw `git log --format=LOG_FORMAT` output into commits.
 */
export const splitCommitLog = (raw) =>
    String(raw ?? '')
        .split('\x1e')
        .map((record) => record.replace(/^\n+/, ''))
        .filter((record) => record.trim() !== '')
        .map((record) => {
            const firstSeparator = record.indexOf('\x1f');

            if (firstSeparator === -1) {
                return { hash: record.trim(), subject: '', body: '' };
            }

            const secondSeparator = record.indexOf('\x1f', firstSeparator + 1);
            const subjectEnd =
                secondSeparator === -1 ? record.length : secondSeparator;
            const body =
                secondSeparator === -1 ? '' : record.slice(secondSeparator + 1);

            return {
                hash: record.slice(0, firstSeparator).trim(),
                subject: record.slice(firstSeparator + 1, subjectEnd).trim(),
                body,
            };
        });

/**
 * Detects the story id and the conventional type of a commit subject.
 * `breaking` only reflects the "!" marker; footers are handled per body.
 */
export const parseHeader = (subject) => {
    const raw = String(subject ?? '');
    const storyMatch = raw.match(STORY_PATTERN);
    const story = storyMatch?.groups?.story ?? '';
    const remainder = storyMatch ? raw.slice(storyMatch[0].length) : raw;
    const typeMatch = remainder.match(TYPE_PATTERN);

    if (!typeMatch?.groups) {
        const text = remainder.trim() || raw.trim();

        return { story, type: '', scope: '', breaking: false, text };
    }

    const { type, scope, breaking, text } = typeMatch.groups;

    return {
        story,
        type: type.toLowerCase(),
        scope: scope ?? '',
        breaking: Boolean(breaking),
        text: text.trim(),
    };
};

/**
 * Extracts bullet list details and the breaking change note from a body.
 * Footer lines such as "Refs: #1" are treated as metadata, not notes.
 */
export const parseBody = (body) => {
    const details = [];
    let breakingNote = '';
    let openTarget = '';

    for (const line of String(body ?? '').split('\n')) {
        const trimmed = line.trim();

        if (trimmed === '') {
            openTarget = '';
            continue;
        }

        const breakingMatch = trimmed.match(BREAKING_FOOTER_PATTERN);

        if (breakingMatch?.groups) {
            breakingNote = breakingMatch.groups.note.trim();
            openTarget = 'note';
            continue;
        }

        const bulletMatch = line.match(BULLET_PATTERN);

        if (bulletMatch?.groups) {
            details.push({
                indent: bulletMatch.groups.indent,
                text: bulletMatch.groups.text.trim(),
            });
            openTarget = 'detail';
            continue;
        }

        if (FOOTER_PATTERN.test(trimmed)) {
            openTarget = '';
            continue;
        }

        if (!/^\s/.test(line) || !openTarget) {
            continue;
        }

        if (openTarget === 'note') {
            breakingNote = `${breakingNote} ${trimmed}`.trim();
            continue;
        }

        const lastDetail = details.at(-1);

        if (lastDetail) {
            lastDetail.text = `${lastDetail.text} ${trimmed}`;
        }
    }

    return { details, breakingNote };
};

/**
 * Normalises one commit into the shape used by bumping and notes.
 */
export const parseCommit = ({ hash = '', subject = '', body = '' }) => {
    const header = parseHeader(subject);
    const { details, breakingNote } = parseBody(body);

    return {
        hash,
        ...header,
        breaking: header.breaking || breakingNote !== '',
        breakingNote,
        details,
    };
};

/**
 * Convenience wrapper for `git log --format=LOG_FORMAT` output.
 */
export const parseCommitLog = (raw) => splitCommitLog(raw).map(parseCommit);

/**
 * Precedence across a mixed range: any breaking commit wins, then "feat",
 * then everything else is a patch.
 */
export const resolveBump = (commits) => {
    if (commits.some((commit) => commit.breaking)) {
        return 'major';
    }

    if (commits.some((commit) => commit.type === 'feat')) {
        return 'minor';
    }

    return 'patch';
};

export const groupCommits = (commits) => {
    const sections = {
        breaking: [],
        features: [],
        fixes: [],
        perf: [],
        docs: [],
        other: [],
    };

    for (const commit of commits) {
        if (commit.breaking) {
            sections.breaking.push(commit);
        } else if (commit.type === 'feat') {
            sections.features.push(commit);
        } else if (commit.type === 'fix') {
            sections.fixes.push(commit);
        } else if (commit.type === 'perf') {
            sections.perf.push(commit);
        } else if (commit.type === 'docs') {
            sections.docs.push(commit);
        } else {
            sections.other.push(commit);
        }
    }

    return sections;
};

const renderEntry = (commit, repo) => {
    const scope = commit.scope ? `**${commit.scope}:** ` : '';
    const link = `([\`${commit.hash}\`](https://github.com/${repo}/commit/${commit.hash}))`;
    const lines = [`- ${scope}${commit.text} ${link}`];

    if (commit.breakingNote) {
        lines.push(`  - **BREAKING CHANGE:** ${commit.breakingNote}`);
    }

    for (const detail of commit.details) {
        const indent = detail.indent.replace(/\t/g, '  ').length;
        const level = 1 + Math.floor(indent / 2);

        lines.push(`${'  '.repeat(level)}- ${detail.text}`);
    }

    return lines;
};

const groupByStory = (commits) => {
    const groups = new Map();
    const ungrouped = [];

    for (const commit of commits) {
        if (!commit.story) {
            ungrouped.push(commit);
            continue;
        }

        if (!groups.has(commit.story)) {
            groups.set(commit.story, []);
        }

        groups.get(commit.story).push(commit);
    }

    return { groups: [...groups.entries()], ungrouped };
};

const writeSection = (lines, title, commits, repo) => {
    if (commits.length === 0) {
        return;
    }

    lines.push(`### ${title}`, '');

    const { groups, ungrouped } = groupByStory(commits);

    for (const [story, storyCommits] of groups) {
        lines.push(`#### ${story}`, '');

        for (const commit of storyCommits) {
            lines.push(...renderEntry(commit, repo));
        }

        lines.push('');
    }

    for (const commit of ungrouped) {
        lines.push(...renderEntry(commit, repo));
    }

    if (ungrouped.length > 0) {
        lines.push('');
    }
};

const formatUtcTimestamp = (value) =>
    new Date(value).toISOString().replace(/\.\d{3}Z$/, 'Z');

/**
 * Renders the release notes body from parsed commits.
 */
export const renderReleaseNotes = ({
    repo,
    prevTag = '',
    nextTag,
    commits,
    commitSha = '',
    releasedAt = new Date(),
}) => {
    const sections = groupCommits(commits);
    const lines = ["## What's Changed", ''];

    writeSection(lines, '⚠️ Breaking Changes', sections.breaking, repo);
    writeSection(lines, '✨ Features', sections.features, repo);
    writeSection(lines, '🐛 Bug Fixes', sections.fixes, repo);
    writeSection(lines, '⚡ Performance', sections.perf, repo);
    writeSection(lines, '📝 Documentation', sections.docs, repo);
    writeSection(lines, '🧰 Other Changes', sections.other, repo);

    const changelog = prevTag
        ? `**Full Changelog**: [\`${prevTag}...${nextTag}\`](https://github.com/${repo}/compare/${prevTag}...${nextTag})`
        : `**Full Changelog**: [\`${nextTag}\`](https://github.com/${repo}/commits/${nextTag})`;

    lines.push(changelog);

    if (commitSha) {
        lines.push(`**Commit SHA**: \`${commitSha}\``);
    }

    lines.push(`**Released (UTC)**: \`${formatUtcTimestamp(releasedAt)}\``);

    return `${lines.join('\n')}\n`;
};
