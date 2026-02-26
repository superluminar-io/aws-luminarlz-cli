import * as readline from 'node:readline/promises';
import type { BaseContext } from 'clipanion';
import { BlueprintFileDiff, ExistingFileDecision } from '../blueprint/blueprint';

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  header: string;
  lines: string[];
}

export type ExistingFileSelector = (fileDiff: BlueprintFileDiff) => Promise<ExistingFileDecision>;
export type OutputWriter = Pick<BaseContext['stdout'], 'write'>;
export type PromptReader = Pick<readline.Interface, 'question'>;

export interface HunkApplication {
  hunk: DiffHunk;
  lines: string[];
}
