import * as readline from 'node:readline/promises';
import { BlueprintFileDiff } from '../../../src/core/blueprint/blueprint';
import { createInteractiveDiffSelector, UserAbortError } from '../../../src/core/interactive-merge';

type PromptReader = Pick<readline.Interface, 'question'>;

const createRl = (answers: string[]): PromptReader => {
  const queue = [...answers];
  return {
    question: jest.fn(async () => queue.shift() ?? ''),
  };
};

const createRlMock = (answers: string[]) => {
  const queue = [...answers];
  const question = jest.fn(async () => queue.shift() ?? '');
  return {
    rl: { question } as PromptReader,
    question,
  };
};

const createSelector = (
  answers: string[],
  options: { autoApply: boolean; dryRun: boolean; lineMode: boolean },
) => {
  const rl = createRl(answers);
  return createInteractiveDiffSelector({
    rl,
    autoApply: options.autoApply,
    dryRun: options.dryRun,
    lineMode: options.lineMode,
  });
};

const makeFileDiff = (currentContent: string, renderedContent: string): BlueprintFileDiff => ({
  relativePath: 'config.ts',
  targetPath: '/tmp/config.ts',
  currentContent,
  renderedContent,
});

describe('Setup update interactive diff selector', () => {
  beforeEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
  });

  describe('when selecting mode by priority', () => {
    it('should prioritize autoApply over dryRun and lineMode', async () => {
      const selector = createSelector([], { autoApply: true, dryRun: true, lineMode: true });
      const decision = await selector(makeFileDiff('same', 'same'));
      expect(decision).toBe('apply');
    });

    it('should prioritize dryRun over lineMode when autoApply is disabled', async () => {
      const selector = createSelector([], { autoApply: false, dryRun: true, lineMode: true });
      const decision = await selector(makeFileDiff('same', 'same'));
      expect(decision).toBe('skip');
    });
  });

  describe('when running in block mode', () => {
    it('should re-prompt after an invalid answer and apply a hunk after a valid answer', async () => {
      const selector = createSelector(['o', 'y'], { autoApply: false, dryRun: false, lineMode: false });
      const decision = await selector(makeFileDiff('before\n', 'after\n'));
      expect(decision).toBe('apply');
    });

    it('should abort when answer is a', async () => {
      const selector = createSelector(['a'], { autoApply: false, dryRun: false, lineMode: false });
      await expect(selector(makeFileDiff('before\n', 'after\n'))).rejects.toBeInstanceOf(UserAbortError);
    });

    it('should return updatedContent for mixed multi-hunk decisions', async () => {
      const selector = createSelector(['y', 'n'], { autoApply: false, dryRun: false, lineMode: false });
      const currentContent = 'first\nl2\nl3\nl4\nl5\nl6\nl7\nl8\nl9\nsecond\n';
      const renderedContent = 'FIRST\nl2\nl3\nl4\nl5\nl6\nl7\nl8\nl9\nSECOND\n';

      const decision = await selector(makeFileDiff(currentContent, renderedContent));

      expect(typeof decision).toBe('object');
      expect(decision).toEqual({ updatedContent: 'FIRST\nl2\nl3\nl4\nl5\nl6\nl7\nl8\nl9\nsecond\n' });
    });
  });

  describe('when running in line mode', () => {
    it('should apply pairwise replacement when removed and added line counts are equal', async () => {
      const selector = createSelector(['y'], { autoApply: false, dryRun: false, lineMode: true });
      const decision = await selector(makeFileDiff('value: old\n', 'value: new\n'));
      expect(decision).toEqual({ updatedContent: 'value: new\n' });
    });

    it('should apply replacement block when removed and added line counts differ', async () => {
      const selector = createSelector(['y'], { autoApply: false, dryRun: false, lineMode: true });
      const currentContent = 'one\ntwo\nthree\n';
      const renderedContent = 'updated\nthree\n';

      const decision = await selector(makeFileDiff(currentContent, renderedContent));
      expect(decision).toEqual({ updatedContent: 'updated\nthree\n' });
    });

    it('should abort when line-mode answer is a', async () => {
      const selector = createSelector(['a'], { autoApply: false, dryRun: false, lineMode: true });
      await expect(selector(makeFileDiff('before\n', 'after\n'))).rejects.toBeInstanceOf(UserAbortError);
    });

    it('should apply changes when files use crlf line endings', async () => {
      const selector = createSelector(['y'], { autoApply: false, dryRun: false, lineMode: true });
      const decision = await selector(makeFileDiff('a\r\nold\r\n', 'a\r\nnew\r\n'));
      expect(decision).toEqual({ updatedContent: 'a\r\nnew\r\n' });
    });

    it('should apply changes when content has no trailing newline', async () => {
      const selector = createSelector(['y'], { autoApply: false, dryRun: false, lineMode: true });
      const decision = await selector(makeFileDiff('before', 'after'));
      expect(decision).toEqual({ updatedContent: 'after' });
    });
  });

  describe('when running in dry-run mode', () => {
    it('should allow temporary line preview and finish with skip', async () => {
      const selector = createSelector(['l', ''], { autoApply: false, dryRun: true, lineMode: false });
      const decision = await selector(makeFileDiff('before\n', 'after\n'));
      expect(decision).toBe('skip');
    });

    it('should abort from preview when answer is a', async () => {
      const selector = createSelector(['a'], { autoApply: false, dryRun: true, lineMode: false });
      await expect(selector(makeFileDiff('before\n', 'after\n'))).rejects.toBeInstanceOf(UserAbortError);
    });

    it('should prompt with dry-run block mode label in non-interactive terminal mode', async () => {
      const { rl, question } = createRlMock(['']);
      const selector = createInteractiveDiffSelector({
        rl,
        autoApply: false,
        dryRun: true,
        lineMode: false,
      });

      await selector(makeFileDiff('before\n', 'after\n'));

      expect(question).toHaveBeenCalledWith(expect.stringContaining('[BLOCK MODE][DRY RUN] [config.ts]'));
    });
  });

  describe('when running with interactive terminal input', () => {
    const stdinWithRaw = process.stdin as NodeJS.ReadStream & {
      isRaw?: boolean;
    };

    let originalSetRawModeDescriptor: PropertyDescriptor | null;
    let resumeSpy: jest.SpyInstance;
    let pauseSpy: jest.SpyInstance;
    let setRawModeMock: jest.Mock;

    beforeEach(() => {
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
      stdinWithRaw.isRaw = false;
      originalSetRawModeDescriptor = Object.getOwnPropertyDescriptor(process.stdin, 'setRawMode') ?? null;
      setRawModeMock = jest.fn();
      Object.defineProperty(process.stdin, 'setRawMode', {
        value: setRawModeMock,
        configurable: true,
        writable: true,
      });
      resumeSpy = jest.spyOn(process.stdin, 'resume').mockImplementation(() => process.stdin);
      pauseSpy = jest.spyOn(process.stdin, 'pause').mockImplementation(() => process.stdin);
    });

    afterEach(() => {
      if (originalSetRawModeDescriptor) {
        Object.defineProperty(process.stdin, 'setRawMode', originalSetRawModeDescriptor);
      } else {
        Reflect.deleteProperty(process.stdin, 'setRawMode');
      }
      resumeSpy.mockRestore();
      pauseSpy.mockRestore();
    });

    it('should accept single-key confirmation without enter in block mode', async () => {
      const selector = createSelector([], { autoApply: false, dryRun: false, lineMode: false });
      const decisionPromise = selector(makeFileDiff('before\n', 'after\n'));

      await new Promise((resolve) => setImmediate(resolve));
      process.stdin.emit('data', Buffer.from('y'));

      const decision = await decisionPromise;
      expect(decision).toBe('apply');
      expect(setRawModeMock).toHaveBeenCalledWith(true);
      expect(setRawModeMock).toHaveBeenCalledWith(false);
    });

    it('should ignore invalid keys and continue waiting for a valid key', async () => {
      const selector = createSelector([], { autoApply: false, dryRun: false, lineMode: false });
      const decisionPromise = selector(makeFileDiff('before\n', 'after\n'));

      await new Promise((resolve) => setImmediate(resolve));
      process.stdin.emit('data', Buffer.from('o'));
      process.stdin.emit('data', Buffer.from('y'));

      const decision = await decisionPromise;
      expect(decision).toBe('apply');
      expect(setRawModeMock).toHaveBeenCalledWith(true);
      expect(setRawModeMock.mock.calls).toEqual([[true], [false]]);
    });

    it('should abort with ctrl+c in block mode', async () => {
      const selector = createSelector([], { autoApply: false, dryRun: false, lineMode: false });
      const decisionPromise = selector(makeFileDiff('before\n', 'after\n'));

      await new Promise((resolve) => setImmediate(resolve));
      process.stdin.emit('data', Buffer.from('\u0003'));

      await expect(decisionPromise).rejects.toBeInstanceOf(UserAbortError);
    });

    it('should abort with ctrl+c in dry-run preview mode', async () => {
      const selector = createSelector([], { autoApply: false, dryRun: true, lineMode: false });
      const decisionPromise = selector(makeFileDiff('before\n', 'after\n'));

      await new Promise((resolve) => setImmediate(resolve));
      process.stdin.emit('data', Buffer.from('\u0003'));

      await expect(decisionPromise).rejects.toBeInstanceOf(UserAbortError);
    });

    it('should abort with ctrl+c in line mode', async () => {
      const selector = createSelector([], { autoApply: false, dryRun: false, lineMode: true });
      const decisionPromise = selector(makeFileDiff('before\n', 'after\n'));

      await new Promise((resolve) => setImmediate(resolve));
      process.stdin.emit('data', Buffer.from('\u0003'));

      await expect(decisionPromise).rejects.toBeInstanceOf(UserAbortError);
    });

    it('should restore raw mode after ctrl+c abort in block mode', async () => {
      const selector = createSelector([], { autoApply: false, dryRun: false, lineMode: false });
      const decisionPromise = selector(makeFileDiff('before\n', 'after\n'));

      await new Promise((resolve) => setImmediate(resolve));
      process.stdin.emit('data', Buffer.from('\u0003'));

      await expect(decisionPromise).rejects.toBeInstanceOf(UserAbortError);
      expect(setRawModeMock.mock.calls).toEqual([[true], [false]]);
    });
  });

  describe('when diffs contain whitespace-only changes', () => {
    it('should allow block-mode apply for whitespace-only differences', async () => {
      const selector = createSelector(['y'], { autoApply: false, dryRun: false, lineMode: false });
      const decision = await selector(makeFileDiff('value\n', 'value \n'));
      expect(decision).toBe('apply');
    });

    it('should allow block-mode skip for whitespace-only differences', async () => {
      const selector = createSelector(['n'], { autoApply: false, dryRun: false, lineMode: false });
      const decision = await selector(makeFileDiff('value\n', 'value \n'));
      expect(decision).toBe('skip');
    });
  });
});
