import { Command } from 'clipanion';
import { LzaCustomizationsStack } from './lza-customizations-stack';
import { acceleratorConfigOutSynth } from '../luminarlz/accelerator-config-out-synth';
import { customizationsCdkSynth } from '../luminarlz/customizations-synth';
import { awsAcceleratorSynth } from '../luminarlz/lza-repository-checkout';

export class LzaCustomizationsStackSynth extends LzaCustomizationsStack {
  static paths = [[...super.namespacePath, 'synth']];

  static usage = Command.Usage({
    category: super.category,
    description: 'Synth a single customizations stack for an account and optionally a region.',
    details: `
      This includes synthesizing the customizations CDK stack and the LZA stack.
    `,
  });

  async execute() {
    await customizationsCdkSynth(this.stackName);
    await acceleratorConfigOutSynth();
    await awsAcceleratorSynth({
      accountId: this.accountId,
      region: this.regionOrHomeRegion,
    });
    console.log(
      `Synthesized AWS Accelerator customizations stack: ${this.stackName} for account: ${this.accountId} and region: ${(this.regionOrHomeRegion)}. ✅`,
    );
  }
}
