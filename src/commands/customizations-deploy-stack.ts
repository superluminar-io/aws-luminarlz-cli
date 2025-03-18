import { Command, Option } from 'clipanion';
import { acceleratorConfigOutSynth } from '../luminarlz/accelerator-config-out-synth';
import { customizationsDeployStack } from '../luminarlz/customizations-deploy-stack';
import { customizationsPublishCdkAssets } from '../luminarlz/customizations-publish-cdk-assets';
import { awsAcceleratorSynth, customizationsCdkSynth } from '../luminarlz/customizations-synth';

export class CustomizationsDeployStack extends Command {
  static paths = [['customizations', 'deploy-stack']];

  stackName = Option.String({
    required: true,
  });
  accountId = Option.String({
    required: true,
  });
  region = Option.String({
    required: true,
  });

  async execute() {
    await customizationsCdkSynth(this.stackName);
    await acceleratorConfigOutSynth();
    await awsAcceleratorSynth({
      accountId: this.accountId,
      region: this.region,
    });
    await customizationsPublishCdkAssets();
    await customizationsDeployStack({
      accountId: this.accountId,
      region: this.region,
      stackName: this.stackName,
    });
    console.log(
      `Deployed AWS Accelerator customizations stack: ${this.stackName} for account: ${this.accountId} and region: ${this.region}. ✅`,
    );
  }
}
