import { Command } from 'clipanion';
import { customizationsPublishCdkAssets } from '../luminarlz/customizations-publish-cdk-assets';

export class CustomizationsPublishCdkAssets extends Command {
  static paths = [['customizations', 'publish-cdk-assets']];

  async execute() {
    await customizationsPublishCdkAssets();
    console.log('Published customizations CDK assets. ✅');
  }
}
