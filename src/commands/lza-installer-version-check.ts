import { Command } from 'clipanion';
import { checkVersion } from '../core/accelerator/installer/installer';

export class LzaInstallerVersionCheck extends Command {
  static paths = [['lza', 'installer-version', 'check']];

  static usage = Command.Usage({
    category: 'LZA Installer Version',
    description: 'Check that the version of the Landing Zone Accelerator Installer is in sync with the one configured.',
  });

  async execute() {
    console.log(`Installer version in sync: ${await checkVersion()}`);
  }
}
