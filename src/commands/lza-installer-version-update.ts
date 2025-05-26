import { Command } from 'clipanion';
import { updateVersion } from '../core/accelerator/installer/installer';

export class LzaInstallerVersionUpdate extends Command {
  static paths = [['lza', 'installer-version', 'update']];
  static category = 'LZA Installer Version';

  static usage = Command.Usage({
    category: 'LZA Installer Version',
    description: 'Trigger a version update of the Landing Zone Accelerator Installer Stack.',
  });

  async execute() {
    await updateVersion();
  }
}
