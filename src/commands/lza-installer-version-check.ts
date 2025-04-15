import { Command } from 'clipanion';
import { checkInstallerVersion } from '../luminarlz/accelerator-installer';

export class LzaInstallerVersionCheck extends Command {
  static paths = [['lza', 'installer-version', 'check']];

  static usage = Command.Usage({
    category: 'LZA Installer Version',
    description: 'Check that the version of the Landing Zone Accelerator Installer is in sync with the one configured.',
  });

  async execute() {
    console.log(`Installer version in sync: ${await checkInstallerVersion()}`);
    console.log('Done. ✅');
  }
}
