import * as readline from 'node:readline/promises';
import { BlueprintFileDiff, ExistingFileDecision } from './blueprint';

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  header: string;
  lines: string[];
}

export type ExistingFileSelector = (fileDiff: BlueprintFileDiff) => Promise<ExistingFileDecision>;
export type OutputWriter = { write: (text: string) => void };
export type PromptReader = Pick<readline.Interface, 'question'>;

export interface HunkApplication {
  hunk: DiffHunk;
  lines: string[];
}
