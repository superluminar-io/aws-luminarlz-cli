import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DiffHunk, HunkApplication } from './interactive-types';
import { BlueprintFileDiff } from '../blueprint/blueprint';

const isHunkHeader = (line: string): boolean => line.startsWith('@@ ');
const HUNK_HEADER_REGEX = /^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/;
const NO_NEWLINE_MARKER = '\\ No newline at end of file';

const parseHunkHeader = (line: string): { oldStart: number; oldCount: number } => {
  const match = line.match(HUNK_HEADER_REGEX);
  if (!match) {
    throw new Error(`Unable to parse diff hunk header: ${line}`);
  }

  return {
    oldStart: Number(match[1]),
    oldCount: match[2] ? Number(match[2]) : 1,
  };
};

const isPatchBodyLine = (line: string): boolean =>
  line.startsWith(' ') || line.startsWith('-') || line.startsWith('+');

const createDiffHunk = (line: string): DiffHunk => {
  const parsedHeader = parseHunkHeader(line);
  return {
    oldStart: parsedHeader.oldStart,
    oldCount: parsedHeader.oldCount,
    header: line,
    lines: [],
  };
};

const pushHunkIfPresent = (hunks: DiffHunk[], hunk: DiffHunk | null): void => {
  if (hunk) {
    hunks.push(hunk);
  }
};

const handleDiffBodyLine = (line: string, currentHunk: DiffHunk | null): void => {
  if (!currentHunk) {
    return;
  }

  if (line.startsWith(NO_NEWLINE_MARKER)) {
    return;
  }

  if (isPatchBodyLine(line)) {
    currentHunk.lines.push(line);
  }
};

const parseDiffHunks = (diffText: string): DiffHunk[] => {
  const lines = splitNormalizedLines(diffText);
  const hunks: DiffHunk[] = [];

  let currentHunk: DiffHunk | null = null;

  for (const line of lines) {
    if (isHunkHeader(line)) {
      pushHunkIfPresent(hunks, currentHunk);
      currentHunk = createDiffHunk(line);
      continue;
    }
    handleDiffBodyLine(line, currentHunk);
  }

  pushHunkIfPresent(hunks, currentHunk);

  return hunks;
};

function getGitDiff(fileDiff: BlueprintFileDiff) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aws-luminarlz-diff-'));
  const currentPath = path.join(tempDir, 'current');
  const renderedPath = path.join(tempDir, 'rendered');

  try {
    fs.writeFileSync(currentPath, fileDiff.currentContent);
    fs.writeFileSync(renderedPath, fileDiff.renderedContent);

    const diffResult = spawnSync('git', ['--no-pager', 'diff', '--no-index', '--', currentPath, renderedPath], {
      encoding: 'utf8',
    });

    const stdout = (diffResult.stdout ?? '')
      .replaceAll(currentPath, `a/${fileDiff.relativePath}`)
      .replaceAll(renderedPath, `b/${fileDiff.relativePath}`);

    return {
      ...diffResult,
      stdout,
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

const renderGitStyleDiff = (fileDiff: BlueprintFileDiff): string => {
  const diffResult = getGitDiff(fileDiff);

  if (diffResult.error) {
    throw new Error(`Failed to run git diff for ${fileDiff.relativePath}: ${diffResult.error.message}`);
  }

  if (typeof diffResult.status === 'number' && diffResult.status > 1) {
    const stderr = (diffResult.stderr || '').toString().trim();
    const stderrSuffix = stderr ? `: ${stderr}` : '';
    throw new Error(`git diff failed for ${fileDiff.relativePath}${stderrSuffix}`);
  }

  const rawDiff = diffResult.stdout || '';
  if (!rawDiff) {
    return `No textual diff for ${fileDiff.relativePath}`;
  }

  return rawDiff;
};

const detectLineDelimiter = (content: string): string => {
  if (content.includes('\r\n')) {
    return '\r\n';
  }
  if (content.includes('\r')) {
    return '\r';
  }
  return '\n';
};

const joinWithOriginalDelimiter = (content: string, lines: string[]): string => {
  return lines.join(detectLineDelimiter(content));
};

const splitNormalizedLines = (content: string): string[] => {
  return content.split(/\r\n|\n|\r/);
};

export const parseFileDiffHunks = (fileDiff: BlueprintFileDiff): DiffHunk[] => {
  return parseDiffHunks(renderGitStyleDiff(fileDiff));
};

const CONTEXT_LINE_PREFIX = ' ';
const ADDED_LINE_PREFIX = '+';
const REMOVED_LINE_PREFIX = '-';

const extractHunkLinesByPrefixes = (hunk: DiffHunk, allowedPrefixes: ReadonlySet<string>): string[] => {
  const result: string[] = [];
  for (const line of hunk.lines) {
    if (allowedPrefixes.has(line[0])) {
      result.push(line.slice(1));
    }
  }
  return result;
};

const APPLIED_LINE_PREFIXES = new Set([CONTEXT_LINE_PREFIX, ADDED_LINE_PREFIX]);
const ORIGINAL_LINE_PREFIXES = new Set([CONTEXT_LINE_PREFIX, REMOVED_LINE_PREFIX]);

export const extractAppliedHunkLines = (hunk: DiffHunk): string[] => {
  return extractHunkLinesByPrefixes(hunk, APPLIED_LINE_PREFIXES);
};

export const extractOriginalHunkLines = (hunk: DiffHunk): string[] => {
  return extractHunkLinesByPrefixes(hunk, ORIGINAL_LINE_PREFIXES);
};

export const rebuildContentFromHunks = (
  currentContent: string,
  hunkApplications: HunkApplication[],
): string => {
  const originalLines = splitNormalizedLines(currentContent);
  const resultLines: string[] = [];
  let lineCursor = 1;
  const lineIndexFromCursor = (cursor: number): number => Math.max(0, cursor - 1);
  const lineIndexFromHunkStart = (oldStart: number): number => Math.max(0, oldStart - 1);

  for (const { hunk, lines } of hunkApplications) {
    const unchangedLines = originalLines.slice(lineIndexFromCursor(lineCursor), lineIndexFromHunkStart(hunk.oldStart));
    resultLines.push(...unchangedLines);
    resultLines.push(...lines);
    lineCursor = Math.max(1, hunk.oldStart + hunk.oldCount);
  }

  resultLines.push(...originalLines.slice(lineIndexFromCursor(lineCursor)));

  return joinWithOriginalDelimiter(currentContent, resultLines);
};
