/**
 * Types for commit-format.mjs so TypeScript tests can import the module.
 */

export interface CommitDetail {
    indent: string;
    text: string;
}

export interface RawCommit {
    hash: string;
    subject: string;
    body: string;
}

export interface CommitHeader {
    story: string;
    type: string;
    scope: string;
    breaking: boolean;
    text: string;
}

export interface ParsedCommit extends CommitHeader {
    hash: string;
    breakingNote: string;
    details: CommitDetail[];
}

export interface ReleaseSections {
    breaking: ParsedCommit[];
    features: ParsedCommit[];
    fixes: ParsedCommit[];
    perf: ParsedCommit[];
    docs: ParsedCommit[];
    other: ParsedCommit[];
}

export interface ReleaseNotesOptions {
    repo: string;
    prevTag?: string;
    nextTag: string;
    commits: ParsedCommit[];
    releasedAt?: string | Date;
}

export type VersionBump = 'major' | 'minor' | 'patch';

export declare const LOG_FORMAT: string;

export declare function splitCommitLog(raw: string): RawCommit[];
export declare function parseHeader(subject: string): CommitHeader;
export declare function parseBody(body: string): {
    details: CommitDetail[];
    breakingNote: string;
};
export declare function parseCommit(commit: Partial<RawCommit>): ParsedCommit;
export declare function parseCommitLog(raw: string): ParsedCommit[];
export declare function resolveBump(commits: ParsedCommit[]): VersionBump;
export declare function groupCommits(commits: ParsedCommit[]): ReleaseSections;
export declare function renderReleaseNotes(
    options: ReleaseNotesOptions,
): string;
