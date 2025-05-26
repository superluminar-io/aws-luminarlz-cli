import { Command } from 'clipanion';
import { synthConfigOut } from '../core/accelerator/config/synth';
import { customizationsCdkSynth } from '../core/customizations/synth';

export class Synth extends Command {
  static paths = [['synth']];

  static usage = Command.Usage({
    description: 'Synth everything!',
  });

  async execute() {
    await customizationsCdkSynth();
    await synthConfigOut();
    console.log('Done. ✅');
  }
}
