import { BlueprintFileDiff } from '../../../src/core/blueprint/blueprint';
import {
  parseFileDiffHunks,
  rebuildContentFromHunks,
} from '../../../src/core/blueprint/interactive-diff';
import { HunkApplication } from '../../../src/core/blueprint/interactive-types';

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
});
