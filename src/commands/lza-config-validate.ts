import { Command } from 'clipanion';
import { synthConfigOut } from '../core/accelerator/config/synth';
import { validate } from '../core/accelerator/repository/core_cli';
import { customizationsCdkSynth } from '../core/customizations/synth';

export class LzaConfigValidate extends Command {
  static paths = [['lza', 'config', 'validate']];

  static usage = Command.Usage({
    category: 'LZA Config',
    description: 'Validate the synthesized LZA config.',
  });

  async execute() {
    await customizationsCdkSynth();
    await synthConfigOut();
    await validate();
    console.log(
      'Validated AWS Accelerator config. ✅',
    );
  }
}
