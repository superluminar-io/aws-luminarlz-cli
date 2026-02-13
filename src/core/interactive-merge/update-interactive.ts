import { UserAbortError } from './interactive-errors';
import { InteractiveDiffSession } from './interactive-session';
import { ExistingFileSelector, OutputWriter, PromptReader } from './interactive-types';
import { BlueprintFileDiff } from '../blueprint/blueprint';

export { UserAbortError };

export interface InteractiveDiffSelectorOptions {
  rl: PromptReader;
  autoApply: boolean;
  dryRun: boolean;
  lineMode: boolean;
  stdout?: OutputWriter;
}

type ModeStrategy = {
  enabled: (options: InteractiveDiffSelectorOptions) => boolean;
  select: (session: InteractiveDiffSession) => ExistingFileSelector;
};

const modeStrategies: ModeStrategy[] = [
  {
    enabled: (options) => options.autoApply,
    select: () => async () => 'apply',
  },
  {
    enabled: (options) => options.dryRun,
    select: (session) => (fileDiff) => session.previewDiffHunks(fileDiff),
  },
  {
    enabled: (options) => options.lineMode,
    select: (session) => (fileDiff) => session.selectDiffLines(fileDiff),
  },
];

const selectModeHandler = (
  options: InteractiveDiffSelectorOptions,
  session: InteractiveDiffSession,
): ExistingFileSelector => {
  const selectedStrategy = modeStrategies.find((strategy) => strategy.enabled(options));
  if (selectedStrategy) {
    return selectedStrategy.select(session);
  }
  return (fileDiff: BlueprintFileDiff) => session.selectDiffHunks(fileDiff);
};

export const createInteractiveDiffSelector = (options: InteractiveDiffSelectorOptions): ExistingFileSelector => {
  const session = new InteractiveDiffSession(options.rl, options.stdout ?? process.stdout);
  return selectModeHandler(options, session);
};
