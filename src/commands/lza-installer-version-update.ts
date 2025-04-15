import { Command } from 'clipanion';
import { updateInstallerVersion } from '../luminarlz/accelerator-installer';

export class LzaInstallerVersionUpdate extends Command {
  static paths = [['lza', 'installer-version', 'update']];
  static category = 'LZA Installer Version';

  static usage = Command.Usage({
    category: 'LZA Installer Version',
    description: 'Trigger a version update of the Landing Zone Accelerator Installer Stack.',
  });

  async execute() {
    await updateInstallerVersion();
  }
}
