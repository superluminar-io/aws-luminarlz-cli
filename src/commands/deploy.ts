import { Command } from 'clipanion';
import { acceleratorConfigOutPublish } from '../luminarlz/accelerator-config-out-publish';
import { acceleratorConfigOutSynth } from '../luminarlz/accelerator-config-out-synth';
import { customizationsPublishCdkAssets } from '../luminarlz/customizations-publish-cdk-assets';
import { customizationsCdkSynth } from '../luminarlz/customizations-synth';

export class Deploy extends Command {
  static paths = [['deploy']];

  async execute() {
    await customizationsCdkSynth();
    await acceleratorConfigOutSynth();
    await customizationsPublishCdkAssets();
    await acceleratorConfigOutPublish();
    console.log('Done. ✅');
  }
}
