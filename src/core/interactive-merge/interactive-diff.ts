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

const parseDiffHunks = (diffText: string): DiffHunk[] => {
  const lines = splitNormalizedLines(diffText);
  const hunks: DiffHunk[] = [];

  let currentHunk: DiffHunk | null = null;

  for (const line of lines) {
    if (isHunkHeader(line)) {
      const parsedHeader = parseHunkHeader(line);
      if (currentHunk) {
        hunks.push(currentHunk);
      }
      currentHunk = {
        oldStart: parsedHeader.oldStart,
        oldCount: parsedHeader.oldCount,
        header: line,
        lines: [],
      };
      continue;
    }

    if (!currentHunk) {
      continue;
    }

    if (line.startsWith(NO_NEWLINE_MARKER)) {
      continue;
    }

    if (isPatchBodyLine(line)) {
      currentHunk.lines.push(line);
    }
  }

  if (currentHunk) {
    hunks.push(currentHunk);
  }

  return hunks;
};

const renderGitStyleDiff = (fileDiff: BlueprintFileDiff): string => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aws-luminarlz-diff-'));
  const currentPath = path.join(tempDir, 'current');
  const renderedPath = path.join(tempDir, 'rendered');
  fs.writeFileSync(currentPath, fileDiff.currentContent);
  fs.writeFileSync(renderedPath, fileDiff.renderedContent);

  const diffResult = spawnSync('git', ['--no-pager', 'diff', '--no-index', '--', currentPath, renderedPath], {
    encoding: 'utf8',
  });

  fs.rmSync(tempDir, { recursive: true, force: true });

  const rawDiff = diffResult.stdout || '';
  if (!rawDiff) {
    return `No textual diff for ${fileDiff.relativePath}`;
  }

  return rawDiff
    .split(/\r\n|\n|\r/)
    .map((line) => line
      .split(currentPath).join(`a/${fileDiff.relativePath}`)
      .split(renderedPath).join(`b/${fileDiff.relativePath}`))
    .join('\n');
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

export const materializeAppliedHunkLines = (hunk: DiffHunk): string[] => {
  const result: string[] = [];
  for (const line of hunk.lines) {
    if (line.startsWith(' ') || line.startsWith('+')) {
      result.push(line.slice(1));
    }
  }
  return result;
};

export const materializeOriginalHunkLines = (hunk: DiffHunk): string[] => {
  const result: string[] = [];
  for (const line of hunk.lines) {
    if (line.startsWith(' ') || line.startsWith('-')) {
      result.push(line.slice(1));
    }
  }
  return result;
};

export const rebuildContentFromHunks = (
  currentContent: string,
  hunkApplications: HunkApplication[],
): string => {
  const originalLines = splitNormalizedLines(currentContent);
  const resultLines: string[] = [];
  let lineCursor = 1;

  for (const { hunk, lines } of hunkApplications) {
    if (hunk.oldStart > lineCursor) {
      resultLines.push(...originalLines.slice(lineCursor - 1, hunk.oldStart - 1));
    }

    resultLines.push(...lines);
    lineCursor = hunk.oldStart + hunk.oldCount;
  }

  if (lineCursor <= originalLines.length) {
    resultLines.push(...originalLines.slice(lineCursor - 1));
  }

  return joinWithOriginalDelimiter(currentContent, resultLines);
};
