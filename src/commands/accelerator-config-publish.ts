import { Command } from 'clipanion';
import { acceleratorConfigOutPublish } from '../luminarlz/accelerator-config-out-publish';
import { customizationsPublishCdkAssets } from '../luminarlz/customizations-publish-cdk-assets';

export class AcceleratorConfigPublish extends Command {
  static paths = [['accelerator-config', 'publish']];

  async execute() {
    await customizationsPublishCdkAssets();
    await acceleratorConfigOutPublish();
    console.log('Done. ✅');
  }
}
