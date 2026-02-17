import { colorizeDiffLine } from './interactive-output';
import { DiffHunk } from './interactive-types';

export interface LineModeResult {
  lines: string[];
  changed: boolean;
}

type AskLineChoice = (prompt: string) => Promise<string>;
type WriteLine = (text: string) => void;

interface LineModeContext {
  filePath: string;
  askLineChoice: AskLineChoice;
  writeLine: WriteLine;
}

interface HunkStepResult extends LineModeResult {
  nextIndex: number;
}

type DiffLineKind = 'context' | 'remove' | 'add' | 'other';

export class InteractiveLineModeProcessor {
  constructor(private readonly context: LineModeContext) {}

  async processHunk(hunk: DiffHunk): Promise<LineModeResult> {
    const resultLines: string[] = [];
    let changed = false;
    let index = 0;

    while (index < hunk.lines.length) {
      const step = await this.processStep(hunk.lines, index);
      resultLines.push(...step.lines);
      changed = changed || step.changed;
      index = step.nextIndex;
    }

    return { lines: resultLines, changed };
  }

  private async processStep(
    hunkLines: string[],
    index: number,
  ): Promise<HunkStepResult> {
    const line = hunkLines[index];
    const kind = this.getDiffLineKind(line);

    if (kind === 'context') {
      return { lines: [line.slice(1)], changed: false, nextIndex: index + 1 };
    }

    if (kind === 'remove') {
      return this.processRemovalGroup(hunkLines, index);
    }

    if (kind === 'add') {
      const addResult = await this.processAddedLine(line);
      return { ...addResult, nextIndex: index + 1 };
    }

    return { lines: [], changed: false, nextIndex: index + 1 };
  }

  private getDiffLineKind(line: string): DiffLineKind {
    if (line.startsWith(' ')) return 'context';
    if (line.startsWith('-')) return 'remove';
    if (line.startsWith('+')) return 'add';
    return 'other';
  }

  private async processRemovalGroup(
    hunkLines: string[],
    startIndex: number,
  ): Promise<HunkStepResult> {
    const removed = this.collectConsecutive(hunkLines, startIndex, '-');
    const added = this.collectConsecutive(hunkLines, removed.nextIndex, '+');

    if (added.lines.length > 0) {
      const replacement = await this.processReplacementGroup(removed.lines, added.lines);
      return { ...replacement, nextIndex: added.nextIndex };
    }

    const deletion = await this.processDeletionGroup(removed.lines);
    return { ...deletion, nextIndex: removed.nextIndex };
  }

  private async processReplacementGroup(
    removedLines: string[],
    addedLines: string[],
  ): Promise<LineModeResult> {
    if (removedLines.length === addedLines.length) {
      return this.processPairwiseReplacement(removedLines, addedLines);
    }
    return this.processMixedReplacement(removedLines, addedLines);
  }

  private async processPairwiseReplacement(
    removedLines: string[],
    addedLines: string[],
  ): Promise<LineModeResult> {
    return this.processPairedReplacementRange(removedLines, addedLines, 0, removedLines.length);
  }

  private async processMixedReplacement(
    removedLines: string[],
    addedLines: string[],
  ): Promise<LineModeResult> {
    const pairCount = Math.min(removedLines.length, addedLines.length);
    const pairedResult = await this.processPairedReplacementRange(removedLines, addedLines, 0, pairCount);
    const removalResult = await this.processOptionalRemainingRemovals(removedLines, pairCount);
    const additionResult = await this.processOptionalRemainingAdditions(addedLines, pairCount);

    return {
      lines: [...pairedResult.lines, ...removalResult.lines, ...additionResult.lines],
      changed: pairedResult.changed || removalResult.changed || additionResult.changed,
    };
  }

  private async processOptionalRemainingRemovals(
    removedLines: string[],
    pairCount: number,
  ): Promise<LineModeResult> {
    if (pairCount < removedLines.length) {
      return this.processRemainingRemovals(removedLines, pairCount);
    }
    return { lines: [], changed: false };
  }

  private async processOptionalRemainingAdditions(
    addedLines: string[],
    pairCount: number,
  ): Promise<LineModeResult> {
    if (pairCount < addedLines.length) {
      return this.processRemainingAdditions(addedLines, pairCount);
    }
    return { lines: [], changed: false };
  }

  private async processPairedReplacementRange(
    removedLines: string[],
    addedLines: string[],
    startIndex: number,
    endExclusive: number,
  ): Promise<LineModeResult> {
    const lines: string[] = [];
    let changed = false;

    for (let index = startIndex; index < endExclusive; index += 1) {
      const removedLine = removedLines[index];
      const addedLine = addedLines[index];
      this.context.writeLine(colorizeDiffLine(removedLine));
      this.context.writeLine(colorizeDiffLine(addedLine));

      const answer = await this.context.askLineChoice(
        `[LINE MODE] [${this.context.filePath}] Apply this line change? [y/N/a=abort]: `,
      );

      if (answer === 'y') {
        changed = true;
        lines.push(addedLine.slice(1));
      } else {
        lines.push(removedLine.slice(1));
      }
    }

    return { lines, changed };
  }

  private async processRemainingRemovals(
    removedLines: string[],
    startIndex: number,
  ): Promise<LineModeResult> {
    const lines: string[] = [];
    let changed = false;

    for (let index = startIndex; index < removedLines.length; index += 1) {
      const removedLine = removedLines[index];
      this.context.writeLine(colorizeDiffLine(removedLine));
      const answer = await this.context.askLineChoice(
        `[LINE MODE] [${this.context.filePath}] Remove this line? [y/N/a=abort]: `,
      );

      if (answer === 'y') {
        changed = true;
      } else {
        lines.push(removedLine.slice(1));
      }
    }

    return { lines, changed };
  }

  private async processRemainingAdditions(
    addedLines: string[],
    startIndex: number,
  ): Promise<LineModeResult> {
    const lines: string[] = [];
    let changed = false;

    for (let index = startIndex; index < addedLines.length; index += 1) {
      const addition = await this.processAddedLine(addedLines[index]);
      lines.push(...addition.lines);
      changed = changed || addition.changed;
    }

    return { lines, changed };
  }

  private async processDeletionGroup(removedLines: string[]): Promise<LineModeResult> {
    const lines: string[] = [];
    let changed = false;

    for (const line of removedLines) {
      this.context.writeLine(colorizeDiffLine(line));
      const answer = await this.context.askLineChoice(
        `[LINE MODE] [${this.context.filePath}] Remove this line? [y/N/a=abort]: `,
      );

      if (answer === 'y') {
        changed = true;
        continue;
      }

      lines.push(line.slice(1));
    }

    return { lines, changed };
  }

  private async processAddedLine(addedLine: string): Promise<LineModeResult> {
    this.context.writeLine(colorizeDiffLine(addedLine));
    const answer = await this.context.askLineChoice(
      `[LINE MODE] [${this.context.filePath}] Add this line? [y/N/a=abort]: `,
    );

    if (answer === 'y') {
      return { lines: [addedLine.slice(1)], changed: true };
    }

    return { lines: [], changed: false };
  }

  private collectConsecutive(
    lines: string[],
    startIndex: number,
    prefix: '-' | '+',
  ): { lines: string[]; nextIndex: number } {
    const collected: string[] = [];
    let index = startIndex;

    while (index < lines.length && lines[index].startsWith(prefix)) {
      collected.push(lines[index]);
      index += 1;
    }

    return { lines: collected, nextIndex: index };
  }
}
