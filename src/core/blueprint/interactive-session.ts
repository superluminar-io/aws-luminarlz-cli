import { BlueprintFileDiff, ExistingFileDecision } from './blueprint';
import {
  materializeAppliedHunkLines,
  materializeOriginalHunkLines,
  parseFileDiffHunks,
  rebuildContentFromHunks,
} from './interactive-diff';
import { UserAbortError } from './interactive-errors';
import { InteractiveLineModeProcessor } from './interactive-line-mode';
import { colorizeDiffLine, colorizeInfo, colorizeMuted } from './interactive-output';
import { InteractiveTerminalInput } from './interactive-terminal-input';
import { DiffHunk, HunkApplication, OutputWriter, PromptReader } from './interactive-types';

const BLOCK_MODE_CHOICES = new Set(['y', 'n', 'l', 'a']);
const LINE_MODE_CHOICES = new Set(['y', 'n', 'a']);

interface HunkDecisionState {
  changed: boolean;
  usedLineMode: boolean;
  acceptedHunksCount: number;
  hunkApplications: HunkApplication[];
}

interface ResolveHunkDecisionInput extends HunkDecisionState {
  totalHunks: number;
  currentContent: string;
}

const isAbortSelection = (value: string): boolean => value === 'a';

export class InteractiveDiffSession {
  private readonly terminalInput: InteractiveTerminalInput;

  constructor(
    private readonly rl: PromptReader,
    private readonly stdout: OutputWriter,
  ) {
    this.terminalInput = new InteractiveTerminalInput(this.rl, this.stdout);
  }

  async selectDiffHunks(fileDiff: BlueprintFileDiff): Promise<ExistingFileDecision> {
    const hunks = this.prepareHunks(fileDiff, `[BLOCK MODE] Diff for ${fileDiff.relativePath}:`);
    if (!hunks) return 'skip';

    const state = await this.collectBlockModeSelections(hunks, fileDiff.relativePath);
    return this.resolveHunkDecision({
      ...state,
      totalHunks: hunks.length,
      currentContent: fileDiff.currentContent,
    });
  }

  async selectDiffLines(fileDiff: BlueprintFileDiff): Promise<ExistingFileDecision> {
    const hunks = this.prepareHunks(fileDiff, `[LINE MODE] ${fileDiff.relativePath}`);
    if (!hunks) return 'skip';

    const state = await this.collectLineModeSelections(hunks, fileDiff.relativePath);
    return this.resolveHunkDecision({
      ...state,
      usedLineMode: true,
      acceptedHunksCount: 0,
      totalHunks: hunks.length,
      currentContent: fileDiff.currentContent,
    });
  }

  async previewDiffHunks(fileDiff: BlueprintFileDiff): Promise<ExistingFileDecision> {
    const hunks = this.prepareHunks(fileDiff, `[BLOCK MODE][DRY RUN] Preview for ${fileDiff.relativePath}:`);
    if (!hunks) return 'skip';

    await this.walkHunks(hunks, async (hunk) => {
      const key = await this.terminalInput.waitForAnyKey('block', fileDiff.relativePath, true);
      if (key !== 'l') {
        return;
      }
      await this.previewHunkInLineMode(hunk, fileDiff.relativePath);
    });

    return 'skip';
  }

  private async collectBlockModeSelections(
    hunks: DiffHunk[],
    filePath: string,
  ): Promise<HunkDecisionState> {
    const state: HunkDecisionState = {
      changed: false,
      usedLineMode: false,
      acceptedHunksCount: 0,
      hunkApplications: [],
    };

    await this.walkHunks(hunks, async (hunk) => {
      const answer = await this.terminalInput.readChoice(
        `[BLOCK MODE] [${filePath}] Apply this hunk? [y/N/l=line-mode for this hunk/a=abort]: `,
        BLOCK_MODE_CHOICES,
        'n',
      );

      if (isAbortSelection(answer)) {
        throw new UserAbortError();
      }

      if (answer === 'l') {
        await this.applyLineModeForBlockHunk(state, hunk, filePath);
        return;
      }

      if (answer === 'y') {
        this.applyAcceptedBlockHunk(state, hunk);
        return;
      }

      state.hunkApplications.push({ hunk, lines: materializeOriginalHunkLines(hunk) });
    });

    return state;
  }

  private async collectLineModeSelections(
    hunks: DiffHunk[],
    filePath: string,
  ): Promise<Pick<HunkDecisionState, 'changed' | 'hunkApplications'>> {
    const state: Pick<HunkDecisionState, 'changed' | 'hunkApplications'> = {
      changed: false,
      hunkApplications: [],
    };

    await this.walkHunks(hunks, async (hunk) => {
      const lineModeResult = await this.processSingleHunkLineMode(hunk, filePath);
      state.hunkApplications.push({ hunk, lines: lineModeResult.lines });
      state.changed = state.changed || lineModeResult.changed;
    });

    return state;
  }

  private async walkHunks(
    hunks: DiffHunk[],
    visitor: (hunk: DiffHunk, index: number, total: number) => Promise<void>,
  ): Promise<void> {
    for (const [index, hunk] of hunks.entries()) {
      this.writeLine('');
      this.printHunk(hunk, index, hunks.length);
      await visitor(hunk, index, hunks.length);
    }
  }

  private async applyLineModeForBlockHunk(
    state: HunkDecisionState,
    hunk: DiffHunk,
    filePath: string,
  ): Promise<void> {
    state.usedLineMode = true;
    this.writeLine(colorizeInfo('[LINE MODE] Temporary switch for current hunk.'));
    const lineModeResult = await this.processSingleHunkLineMode(hunk, filePath);
    state.hunkApplications.push({ hunk, lines: lineModeResult.lines });
    state.changed = state.changed || lineModeResult.changed;
    this.writeLine(colorizeInfo('[BLOCK MODE] Returning to block mode.'));
  }

  private applyAcceptedBlockHunk(state: HunkDecisionState, hunk: DiffHunk): void {
    state.acceptedHunksCount += 1;
    state.changed = true;
    state.hunkApplications.push({ hunk, lines: materializeAppliedHunkLines(hunk) });
  }

  private async previewHunkInLineMode(hunk: DiffHunk, filePath: string): Promise<void> {
    const changedLines = hunk.lines.filter((line) => line.startsWith('+') || line.startsWith('-'));

    this.writeLine('');
    this.writeLine(colorizeInfo('[LINE MODE][DRY RUN] Temporary preview for current hunk.'));

    for (const [lineIndex, line] of changedLines.entries()) {
      this.writeLine('');
      this.writeLine(colorizeMuted(`(${lineIndex + 1}/${changedLines.length})`));
      this.writeLine(colorizeDiffLine(line));
      await this.terminalInput.waitForAnyKey('line', filePath, true);
    }

    this.writeLine(colorizeInfo('[BLOCK MODE][DRY RUN] Returning to block mode preview.'));
  }

  private async processSingleHunkLineMode(
    hunk: DiffHunk,
    filePath: string,
  ): Promise<{ lines: string[]; changed: boolean }> {
    const processor = new InteractiveLineModeProcessor({
      filePath,
      askLineChoice: (prompt) => this.askLineChoice(prompt),
      writeLine: (line) => this.writeLine(line),
    });

    return processor.processHunk(hunk);
  }

  private async askLineChoice(prompt: string): Promise<string> {
    const answer = await this.terminalInput.readChoice(prompt, LINE_MODE_CHOICES, 'n');
    if (isAbortSelection(answer)) {
      throw new UserAbortError();
    }
    return answer;
  }

  private printHunk(hunk: DiffHunk, index: number, total: number): void {
    this.writeLine(colorizeDiffLine(`${hunk.header} (${index + 1}/${total})`));
    for (const line of hunk.lines) {
      this.writeLine(colorizeDiffLine(line));
    }
  }

  private prepareHunks(fileDiff: BlueprintFileDiff, heading: string): DiffHunk[] | null {
    this.writeLine('');
    this.writeLine(heading);

    const hunks = parseFileDiffHunks(fileDiff);
    if (hunks.length === 0) {
      this.writeLine('No patch hunks found.');
      return null;
    }

    return hunks;
  }

  private resolveHunkDecision(input: ResolveHunkDecisionInput): ExistingFileDecision {
    if (!input.changed) {
      return 'skip';
    }

    if (!input.usedLineMode && input.acceptedHunksCount === input.totalHunks) {
      return 'apply';
    }

    const updatedContent = rebuildContentFromHunks(input.currentContent, input.hunkApplications);
    if (updatedContent === input.currentContent) {
      return 'skip';
    }

    return { updatedContent };
  }

  private writeLine(text: string): void {
    this.stdout.write(`${text}\n`);
  }
}
