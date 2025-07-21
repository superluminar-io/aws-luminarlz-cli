import { Command } from 'clipanion';
import { LzaStage } from './lza-stage';
import { synthConfigOut } from '../core/accelerator/config/synth';
import { deployStage, LZA_CUSTOMIZATIONS_STAGE, synthStages } from '../core/accelerator/repository/core_cli';
import { customizationsCdkSynth } from '../core/customizations/synth';
import { customizationsPublishCdkAssets } from '../core/customizations/assets';

export class LzaStageDeploy extends LzaStage {
  static paths = [[...super.namespacePath, 'deploy']];

  static usage = Command.Usage({
    category: super.category,
    description: 'Deploy a LZA stage.',
    details: `
      This includes synthesizing everything as well as deploying the LZA stage.
    `,
  });

  async execute() {
    const stage = this.stageOrDefault;
    await customizationsCdkSynth();
    await synthConfigOut();
    await synthStages({
      stage,
    });
    if (stage === LZA_CUSTOMIZATIONS_STAGE) {
      await customizationsPublishCdkAssets();
    }
    await deployStage({
      stage,
    });
    console.log(
      `Deployed LZA ${stage} stage. ✅`,
    );
  }
}
