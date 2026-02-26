import fs from 'fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { BlueprintImplementation } from '../blueprint-implementation';
import { BlueprintRenderInputs, BlueprintRenderResult, BlueprintRenderer, BlueprintTemplateContext } from '../blueprint-renderer';
import { BlueprintReport, OutputWriter } from '../blueprint-report';

export interface RenderBlueprintOptions extends BlueprintRenderInputs {
  forceOverwrite: boolean;
}

const toBlueprintRenderResult = (templateContext: BlueprintTemplateContext): BlueprintRenderResult => {
  return {
    managementAccountId: templateContext.managementAccountId,
    organizationId: templateContext.organizationId,
    rootOuId: templateContext.rootOuId,
    accountsRootEmail: templateContext.accountsRootEmail,
    installerVersion: templateContext.installerVersion,
    region: templateContext.region,
  };
};

const writeBlueprintFile = async (targetPath: string, content: string): Promise<void> => {
  await mkdir(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content);
};

export class InitApplyReport implements BlueprintReport {
  constructor(private readonly summary: BlueprintRenderResult) {}

  writeOutput(output: OutputWriter): void {
    output.write(`AWS management account ID: ${this.summary.managementAccountId}\n`);
    output.write(`AWS Organizations organization ID: ${this.summary.organizationId}\n`);
    output.write(`AWS Organizations root Organizational Unit (OU) ID: ${this.summary.rootOuId}\n`);
    output.write(`AWS accounts root email address: ${this.summary.accountsRootEmail}\n`);
    output.write(`Landing Zone Accelerator on AWS version: ${this.summary.installerVersion}\n`);
    output.write(`AWS home region: ${this.summary.region}\n`);
    output.write('Done. ✅\n');
  }
}

export class InitImplementation implements BlueprintImplementation<RenderBlueprintOptions, BlueprintReport> {
  constructor(private readonly renderer: BlueprintRenderer) {}

  async apply(options: RenderBlueprintOptions): Promise<BlueprintReport> {
    const renderOutput = await this.renderer.render(options);

    for (const renderedFile of renderOutput.files) {
      if (!options.forceOverwrite && fs.existsSync(renderedFile.targetPath)) {
        console.log(`Skipping ${renderedFile.targetPath} because it already exists.`);
        continue;
      }

      await writeBlueprintFile(renderedFile.targetPath, renderedFile.content);
    }

    const summary = toBlueprintRenderResult(renderOutput.templateContext);
    return new InitApplyReport(summary);
  }
}
