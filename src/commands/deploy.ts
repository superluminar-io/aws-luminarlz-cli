import { Command } from 'clipanion';
import { publishConfigOut } from '../core/accelerator/config/publish';
import { synthConfigOut } from '../core/accelerator/config/synth';
import { customizationsPublishCdkAssets } from '../core/customizations/assets';
import { customizationsCdkSynth } from '../core/customizations/synth';

export class Deploy extends Command {
  static paths = [['deploy']];

  static usage = Command.Usage({
    description: 'Synth and publish everything!',
  });

  async execute() {
    await customizationsCdkSynth();
    await synthConfigOut();
    await customizationsPublishCdkAssets();
    const versionId = await publishConfigOut();
    if (versionId) {
      console.log(`Config uploaded. S3 version ID: ${versionId}`);
    }
    console.log('Done. ✅');
  }
}
