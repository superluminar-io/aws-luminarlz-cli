import { Command } from 'clipanion';
import { LzaCustomizationsStack } from './lza-customizations-stack';
import { acceleratorConfigOutSynth } from '../luminarlz/accelerator-config-out-synth';
import { customizationsDeployStack } from '../luminarlz/customizations-deploy-stack';
import { customizationsPublishCdkAssets } from '../luminarlz/customizations-publish-cdk-assets';
import { customizationsCdkSynth } from '../luminarlz/customizations-synth';
import { awsAcceleratorSynth } from '../luminarlz/lza-repository-checkout';

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
    await acceleratorConfigOutSynth();
    await awsAcceleratorSynth({
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
