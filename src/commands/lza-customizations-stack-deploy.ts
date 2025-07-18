import { Command } from 'clipanion';
import { LzaCustomizationsStack } from './lza-customizations-stack';
import { synthConfigOut } from '../core/accelerator/config/synth';
import { synthStages } from '../core/accelerator/repository/core_cli';
import { customizationsPublishCdkAssets } from '../core/customizations/assets';
import { customizationsDeployStack } from '../core/customizations/deploy';
import { customizationsCdkSynth } from '../core/customizations/synth';

export class LzaCustomizationsStackDeploy extends LzaCustomizationsStack {
  static paths = [[...super.namespacePath, 'deploy']];

  static usage = Command.Usage({
    category: super.category,
    description: 'Synth and deploy a single customizations stack for an account and optionally a region.',
    details: `
      This includes synthesizing the customizations CDK stack as well as synthesizing and deploying the LZA stack.
    `,
  });

  async execute() {
    await customizationsCdkSynth(this.stackName);
    await synthConfigOut();
    await synthStages({
      stage: 'customizations',
      accountId: this.accountId,
      region: this.regionOrHomeRegion,
    });
    await customizationsPublishCdkAssets();
    await customizationsDeployStack({
      accountId: this.accountId,
      region: this.regionOrHomeRegion,
      stackName: this.stackName,
    });
    console.log(
      `Deployed AWS Accelerator customizations stack: ${this.stackName} for account: ${this.accountId} and region: ${(this.regionOrHomeRegion)}. ✅`,
    );
  }
}
