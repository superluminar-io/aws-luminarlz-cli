import * as readline from 'node:readline/promises';
import { blueprintExists, ExistingFileDecision, updateBlueprint } from '../../../src/core/blueprint/blueprint';
import { runSetupUpdate, writeSetupUpdateSummary } from '../../../src/core/interactive-merge/merge-orchestrator';
import { createInteractiveDiffSelector } from '../../../src/core/interactive-merge/update-interactive';

jest.mock('../../../src/core/blueprint/blueprint', () => ({
  ...jest.requireActual('../../../src/core/blueprint/blueprint'),
  blueprintExists: jest.fn(),
  updateBlueprint: jest.fn(),
}));

jest.mock('../../../src/core/interactive-merge/update-interactive', () => ({
  ...jest.requireActual('../../../src/core/interactive-merge/update-interactive'),
  createInteractiveDiffSelector: jest.fn(),
}));

type PromptReader = Pick<readline.Interface, 'question'>;

const updateBlueprintMock = jest.mocked(updateBlueprint);
const blueprintExistsMock = jest.mocked(blueprintExists);
const createInteractiveDiffSelectorMock = jest.mocked(createInteractiveDiffSelector);

const makeRl = (): PromptReader => ({
  question: jest.fn(async () => ''),
});

describe('interactive merge orchestration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    blueprintExistsMock.mockReturnValue(true);
  });

  it('should run setup update with provided options without prompting for input', async () => {
    const selector = jest.fn<Promise<ExistingFileDecision>, []>(async () => 'skip');
    createInteractiveDiffSelectorMock.mockReturnValue(selector);
    updateBlueprintMock.mockResolvedValue({
      managementAccountId: '123456789012',
      organizationId: 'o-test',
      rootOuId: 'r-root',
      accountsRootEmail: 'root@example.com',
      installerVersion: '1.14.3',
      region: 'eu-central-1',
      createdCount: 1,
      updatedCount: 2,
      skippedCount: 3,
      unchangedCount: 4,
    });

    const rl = makeRl();
    const output = { write: jest.fn() };

    const result = await runSetupUpdate(rl as readline.Interface, output, {
      accountsRootEmail: 'root@example.com',
      region: 'eu-central-1',
      autoApply: false,
      dryRun: true,
      lineMode: false,
    });

    expect((rl.question as jest.Mock)).not.toHaveBeenCalled();
    expect(createInteractiveDiffSelectorMock).toHaveBeenCalledWith({
      rl,
      autoApply: false,
      dryRun: true,
      lineMode: false,
      stdout: output,
    });
    expect(updateBlueprintMock).toHaveBeenCalledWith('foundational', {
      accountsRootEmail: 'root@example.com',
      region: 'eu-central-1',
      dryRun: true,
      onExistingFileDiff: selector,
    });
    expect(result.updatedCount).toBe(2);
  });

  it('should write summary lines including dry-run hint', () => {
    const output = { write: jest.fn() };

    writeSetupUpdateSummary({
      createdCount: 1,
      updatedCount: 2,
      skippedCount: 3,
      unchangedCount: 4,
    }, true, output);

    expect(output.write).toHaveBeenCalledWith('Created files: 1\n');
    expect(output.write).toHaveBeenCalledWith('Updated files: 2\n');
    expect(output.write).toHaveBeenCalledWith('Skipped files: 3\n');
    expect(output.write).toHaveBeenCalledWith('Unchanged files: 4\n');
    expect(output.write).toHaveBeenCalledWith('Dry run completed. No files were modified.\n');
    expect(output.write).toHaveBeenCalledWith('Done. ✅\n');
  });
});
