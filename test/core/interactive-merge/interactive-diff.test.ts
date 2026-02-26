jest.mock('node:child_process', () => {
  const actual = jest.requireActual('node:child_process');
  return {
    ...actual,
    spawnSync: jest.fn(actual.spawnSync),
  };
});

import * as childProcess from 'node:child_process';
import { BlueprintFileDiff } from '../../../src/core/blueprint/blueprint';
import {
  parseFileDiffHunks,
  rebuildContentFromHunks,
} from '../../../src/core/interactive-merge/interactive-diff';
import { HunkApplication } from '../../../src/core/interactive-merge/interactive-types';

describe('interactive-diff', () => {
  it('should rebuild content using CRLF delimiter without carriage return artifacts', () => {
    const currentContent = 'line-1\r\nline-2\r\nline-3';
    const hunkApplications: HunkApplication[] = [
      {
        hunk: {
          oldStart: 2,
          oldCount: 1,
          header: '@@ -2 +2 @@',
          lines: [],
        },
        lines: ['LINE-2'],
      },
    ];

    const rebuiltContent = rebuildContentFromHunks(currentContent, hunkApplications);

    expect(rebuiltContent).toBe('line-1\r\nLINE-2\r\nline-3');
    expect(rebuiltContent.includes('\r\r\n')).toBe(false);
  });

  it('should rebuild content using CR delimiter without carriage return artifacts', () => {
    const currentContent = 'line-1\rline-2\rline-3';
    const hunkApplications: HunkApplication[] = [
      {
        hunk: {
          oldStart: 2,
          oldCount: 1,
          header: '@@ -2 +2 @@',
          lines: [],
        },
        lines: ['LINE-2'],
      },
    ];

    const rebuiltContent = rebuildContentFromHunks(currentContent, hunkApplications);

    expect(rebuiltContent).toBe('line-1\rLINE-2\rline-3');
    expect(rebuiltContent.includes('\r\n')).toBe(false);
  });

  it('should parse file diff hunks without carriage return suffixes', () => {
    const fileDiff: BlueprintFileDiff = {
      relativePath: 'config.ts',
      targetPath: 'config.ts',
      currentContent: 'line-1\r\nline-2\r\nline-3\r\n',
      renderedContent: 'line-1\r\nLINE-2\r\nline-3\r\n',
    };

    const hunks = parseFileDiffHunks(fileDiff);

    expect(hunks.length).toBe(1);
    expect(hunks[0].lines).toEqual([
      ' line-1',
      '-line-2',
      '+LINE-2',
      ' line-3',
    ]);
    expect(hunks[0].lines.every((line) => !line.includes('\r'))).toBe(true);
  });

  it('should return expected hunk lines when git diff contains temporary file paths', () => {
    const spawnSyncMock = childProcess.spawnSync as jest.MockedFunction<typeof childProcess.spawnSync>;
    spawnSyncMock.mockImplementationOnce((_command, args) => {
      const gitDiffArgs = args as string[];
      const currentPath = gitDiffArgs[4];
      const renderedPath = gitDiffArgs[5];
      return {
        stdout: [
          `diff --git a${currentPath} b${renderedPath}`,
          `--- a${currentPath}`,
          `+++ b${renderedPath}`,
          '@@ -1 +1 @@',
          `-a${currentPath}`,
          `+b${renderedPath}`,
        ].join('\n'),
        stderr: '',
        status: 1,
        signal: null,
        error: undefined,
        output: ['', '', ''],
        pid: 1,
      } as unknown as ReturnType<typeof childProcess.spawnSync>;
    });

    const fileDiff: BlueprintFileDiff = {
      relativePath: 'config.ts',
      targetPath: 'config.ts',
      currentContent: 'old',
      renderedContent: 'new',
    };

    const hunks = parseFileDiffHunks(fileDiff);

    expect(hunks).toHaveLength(1);
    expect(hunks[0].lines).toEqual(['-a/config.ts', '+b/config.ts']);
  });

  it('should preserve existing content when applying a hunk with oldStart=0', () => {
    const currentContent = 'line-1\nline-2\n';
    const hunkApplications: HunkApplication[] = [
      {
        hunk: {
          oldStart: 0,
          oldCount: 0,
          header: '@@ -0,0 +1 @@',
          lines: [],
        },
        lines: ['inserted-line'],
      },
    ];

    const rebuiltContent = rebuildContentFromHunks(currentContent, hunkApplications);

    expect(rebuiltContent).toBe('inserted-line\nline-1\nline-2\n');
  });

  it('should rebuild content correctly when oldStart=0 hunk is followed by another hunk', () => {
    const currentContent = 'line-1\nline-2\nline-3\n';
    const hunkApplications: HunkApplication[] = [
      {
        hunk: {
          oldStart: 0,
          oldCount: 0,
          header: '@@ -0,0 +1 @@',
          lines: [],
        },
        lines: ['inserted-line'],
      },
      {
        hunk: {
          oldStart: 2,
          oldCount: 1,
          header: '@@ -2 +2 @@',
          lines: [],
        },
        lines: ['LINE-2'],
      },
    ];

    const rebuiltContent = rebuildContentFromHunks(currentContent, hunkApplications);

    expect(rebuiltContent).toBe('inserted-line\nline-1\nLINE-2\nline-3\n');
  });
});
