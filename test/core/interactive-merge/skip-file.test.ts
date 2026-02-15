import * as readline from 'node:readline/promises';
import { BlueprintFileDiff } from '../../../src/core/blueprint/blueprint';
import { createInteractiveDiffSelector } from '../../../src/core/interactive-merge';

type PromptReader = Pick<readline.Interface, 'question'>;

const createRl = (answers: string[]): PromptReader => {
  const queue = [...answers];
  return {
    question: jest.fn(async () => queue.shift() ?? ''),
  };
};

const makeFileDiff = (currentContent: string, renderedContent: string): BlueprintFileDiff => ({
  relativePath: 'config.ts',
  targetPath: '/tmp/config.ts',
  currentContent,
  renderedContent,
});

describe('Skip and accept file functionality', () => {
  beforeEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
  });

  it('should return skip when user presses s in block mode', async () => {
    const rl = createRl(['s']);
    const selector = createInteractiveDiffSelector({
      rl,
      autoApply: false,
      dryRun: false,
      lineMode: false,
    });

    const decision = await selector(makeFileDiff('before\n', 'after\n'));
    expect(decision).toBe('skip');
  });

  it('should return skip on first hunk even with multiple hunks', async () => {
    const rl = createRl(['s']);
    const selector = createInteractiveDiffSelector({
      rl,
      autoApply: false,
      dryRun: false,
      lineMode: false,
    });

    const currentContent = 'line1\nl2\nl3\nl4\nl5\nl6\nl7\nl8\nl9\nline10\n';
    const renderedContent = 'LINE1\nl2\nl3\nl4\nl5\nl6\nl7\nl8\nl9\nLINE10\n';

    const decision = await selector(makeFileDiff(currentContent, renderedContent));
    expect(decision).toBe('skip');
  });

  it('should return skip when pressing s after accepting first hunk', async () => {
    const rl = createRl(['y', 's']);
    const selector = createInteractiveDiffSelector({
      rl,
      autoApply: false,
      dryRun: false,
      lineMode: false,
    });

    const currentContent = 'line1\nl2\nl3\nl4\nl5\nl6\nl7\nl8\nl9\nline10\n';
    const renderedContent = 'LINE1\nl2\nl3\nl4\nl5\nl6\nl7\nl8\nl9\nLINE10\n';

    const decision = await selector(makeFileDiff(currentContent, renderedContent));
    expect(decision).toBe('skip');
  });

  it('should include s option in prompt text', async () => {
    const rl = createRl(['s']);
    const selector = createInteractiveDiffSelector({
      rl,
      autoApply: false,
      dryRun: false,
      lineMode: false,
    });

    await selector(makeFileDiff('before\n', 'after\n'));

    expect(rl.question).toHaveBeenCalledWith(
      expect.stringContaining('s=skip file'),
    );
  });

  it('should return apply when user presses f to accept entire file', async () => {
    const rl = createRl(['f']);
    const selector = createInteractiveDiffSelector({
      rl,
      autoApply: false,
      dryRun: false,
      lineMode: false,
    });

    const decision = await selector(makeFileDiff('before\n', 'after\n'));
    expect(decision).toBe('apply');
  });

  it('should accept all remaining hunks when f is pressed on first hunk', async () => {
    const rl = createRl(['f']);
    const selector = createInteractiveDiffSelector({
      rl,
      autoApply: false,
      dryRun: false,
      lineMode: false,
    });

    const currentContent = 'line1\nl2\nl3\nl4\nl5\nl6\nl7\nl8\nl9\nline10\n';
    const renderedContent = 'LINE1\nl2\nl3\nl4\nl5\nl6\nl7\nl8\nl9\nLINE10\n';

    const decision = await selector(makeFileDiff(currentContent, renderedContent));
    expect(decision).toBe('apply');
  });

  it('should accept first hunk and all remaining hunks when f is pressed on second hunk', async () => {
    const rl = createRl(['y', 'f']);
    const selector = createInteractiveDiffSelector({
      rl,
      autoApply: false,
      dryRun: false,
      lineMode: false,
    });

    const currentContent = 'line1\nl2\nl3\nl4\nl5\nl6\nl7\nl8\nl9\nline10\n';
    const renderedContent = 'LINE1\nl2\nl3\nl4\nl5\nl6\nl7\nl8\nl9\nLINE10\n';

    const decision = await selector(makeFileDiff(currentContent, renderedContent));
    expect(decision).toBe('apply');
  });

  it('should include f option in prompt text', async () => {
    const rl = createRl(['f']);
    const selector = createInteractiveDiffSelector({
      rl,
      autoApply: false,
      dryRun: false,
      lineMode: false,
    });

    await selector(makeFileDiff('before\n', 'after\n'));

    expect(rl.question).toHaveBeenCalledWith(
      expect.stringContaining('f=accept file'),
    );
  });
});
