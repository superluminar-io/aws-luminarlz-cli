import * as readline from 'node:readline/promises';
import { BlueprintFileDiff } from '../../../src/core/blueprint/blueprint';

type PromptReader = Pick<readline.Interface, 'question'>;

const makeFileDiff = (currentContent: string, renderedContent: string): BlueprintFileDiff => ({
  relativePath: 'config.ts',
  targetPath: '/tmp/config.ts',
  currentContent,
  renderedContent,
});

describe('Setup update interactive diff selector error handling', () => {
  beforeEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
    jest.resetModules();
  });

  it('should throw when git diff returns an unparseable hunk header', async () => {
    jest.doMock('node:child_process', () => ({
      spawnSync: jest.fn(() => ({
        stdout: 'diff --git a/current b/rendered\n@@ invalid-header @@\n-before\n+after\n',
      })),
    }));

    const module = await import('../../../src/core/interactive-merge');

    const rl: PromptReader = {
      question: jest.fn(async () => 'y'),
    };

    const selector = module.createInteractiveDiffSelector({
      rl,
      autoApply: false,
      dryRun: false,
      lineMode: false,
    });

    await expect(selector(makeFileDiff('before\n', 'after\n'))).rejects.toThrow('Unable to parse diff hunk header');
  });
});
