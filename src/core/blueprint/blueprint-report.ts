import type { BaseContext } from 'clipanion';

export type OutputWriter = Pick<BaseContext['stdout'], 'write'>;

export interface BlueprintReport {
  writeOutput(output: OutputWriter): void;
}
