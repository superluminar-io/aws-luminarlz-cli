import { Command } from 'clipanion';
import { LzaCustomizationsStack } from './lza-customizations-stack';
import { synthConfigOut } from '../core/accelerator/config/synth';
import { synthStages } from '../core/accelerator/repository/core_cli';
import { customizationsCdkSynth } from '../core/customizations/synth';

export class LzaCustomizationsStackSynth extends LzaCustomizationsStack {
  static paths = [[...super.namespacePath, 'synth']];

  static usage = Command.Usage({
    category: super.category,
    description: 'Synthesize a single customizations stack for an account and optionally a region.',
    details: `
      This includes synthesizing the customizations CDK stack and the LZA stack.
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
    console.log(
      `Synthesized LZA customizations stack: ${this.stackName} for account: ${this.accountId} and region: ${this.regionOrHomeRegion}. ✅`,
    );
  }
}
