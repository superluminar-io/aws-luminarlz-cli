import { Command } from 'clipanion';
import { validateConfig } from '../luminarlz/accelerator-config';
import { acceleratorConfigOutSynth } from '../luminarlz/accelerator-config-out-synth';
import { customizationsCdkSynth } from '../luminarlz/customizations-synth';

export class LzaConfigValidate extends Command {
  static paths = [['lza', 'config', 'validate']];

  static usage = Command.Usage({
    category: 'LZA Config',
    description: 'Validate the synthesized LZA config.',
  });

  async execute() {
    await customizationsCdkSynth();
    await acceleratorConfigOutSynth();
    await validateConfig();
    console.log(
      'Validated AWS Accelerator config. ✅',
    );
  }
}
