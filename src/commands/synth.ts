import { Command } from 'clipanion';
import { acceleratorConfigOutSynth } from '../luminarlz/accelerator-config-out-synth';
import { customizationsCdkSynth } from '../luminarlz/customizations-synth';

export class Synth extends Command {
  static paths = [['synth']];

  static usage = Command.Usage({
    description: 'Synth everything!',
  });

  async execute() {
    await customizationsCdkSynth();
    await acceleratorConfigOutSynth();
    console.log('Done. ✅');
  }
}
