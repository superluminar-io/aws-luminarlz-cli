import fs from 'fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { BlueprintImplementation } from '../blueprint-implementation';
import {
  BlueprintRenderInputs,
  BlueprintRenderer,
  RenderedBlueprintFile,
} from '../blueprint-renderer';
import { BlueprintReport, OutputWriter } from '../blueprint-report';

export interface BlueprintFileDiff {
  relativePath: string;
  targetPath: string;
  currentContent: string;
  renderedContent: string;
}

export type ExistingFileDecision =
  | 'apply'
  | 'skip'
  | { updatedContent: string };

export interface UpdateBlueprintOptions extends BlueprintRenderInputs {
  dryRun?: boolean;
  onExistingFileDiff?: (fileDiff: BlueprintFileDiff) => Promise<ExistingFileDecision>;
}

interface UpdateCounters {
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  unchangedCount: number;
}

const initializeUpdateCounters = (): UpdateCounters => ({
  createdCount: 0,
  updatedCount: 0,
  skippedCount: 0,
  unchangedCount: 0,
});

const writeBlueprintFile = async (targetPath: string, content: string): Promise<void> => {
  await mkdir(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content);
};

export class UpdateApplyReport implements BlueprintReport {
  constructor(
    private readonly summary: UpdateCounters,
    private readonly dryRun: boolean,
  ) {}

  writeOutput(output: OutputWriter): void {
    output.write(`Created files: ${this.summary.createdCount}\n`);
    output.write(`Updated files: ${this.summary.updatedCount}\n`);
    output.write(`Skipped files: ${this.summary.skippedCount}\n`);
    output.write(`Unchanged files: ${this.summary.unchangedCount}\n`);
    if (this.dryRun) {
      output.write('Dry run completed. No files were modified.\n');
    }
    output.write('Done. ✅\n');
  }
}

const resolveExistingFileDecision = async (
  renderedFile: RenderedBlueprintFile,
  currentContent: string,
  onExistingFileDiff?: (fileDiff: BlueprintFileDiff) => Promise<ExistingFileDecision>,
): Promise<ExistingFileDecision> => {
  if (!onExistingFileDiff) {
    return 'skip';
  }

  return onExistingFileDiff({
    relativePath: renderedFile.relativePath,
    targetPath: renderedFile.targetPath,
    currentContent,
    renderedContent: renderedFile.content,
  });
};

const applyExistingFileDecision = async (
  decision: ExistingFileDecision,
  renderedFile: RenderedBlueprintFile,
  currentContent: string,
  dryRun: boolean,
  counters: UpdateCounters,
): Promise<void> => {
  if (decision === 'skip') {
    counters.skippedCount += 1;
    return;
  }

  if (decision === 'apply') {
    counters.updatedCount += 1;
    if (!dryRun) {
      await writeBlueprintFile(renderedFile.targetPath, renderedFile.content);
    }
    return;
  }

  if (decision.updatedContent === currentContent) {
    counters.skippedCount += 1;
    return;
  }

  counters.updatedCount += 1;
  if (!dryRun) {
    await writeBlueprintFile(renderedFile.targetPath, decision.updatedContent);
  }
};

const processRenderedFileUpdate = async (
  renderedFile: RenderedBlueprintFile,
  options: UpdateBlueprintOptions,
  dryRun: boolean,
  counters: UpdateCounters,
): Promise<void> => {
  if (!fs.existsSync(renderedFile.targetPath)) {
    counters.createdCount += 1;
    if (!dryRun) {
      await writeBlueprintFile(renderedFile.targetPath, renderedFile.content);
    }
    return;
  }

  const currentContent = fs.readFileSync(renderedFile.targetPath, 'utf8');
  if (currentContent === renderedFile.content) {
    counters.unchangedCount += 1;
    return;
  }

  const decision = await resolveExistingFileDecision(renderedFile, currentContent, options.onExistingFileDiff);
  await applyExistingFileDecision(decision, renderedFile, currentContent, dryRun, counters);
};

export class UpdateImplementation implements BlueprintImplementation<UpdateBlueprintOptions, BlueprintReport> {
  constructor(private readonly renderer: BlueprintRenderer) {}

  async apply(options: UpdateBlueprintOptions): Promise<BlueprintReport> {
    const renderOutput = await this.renderer.render(options);
    const dryRun = options.dryRun ?? false;
    const counters = initializeUpdateCounters();

    for (const renderedFile of renderOutput.files) {
      await processRenderedFileUpdate(renderedFile, options, dryRun, counters);
    }

    return new UpdateApplyReport(counters, dryRun);
  }
}
