import { Command } from 'clipanion';
import { acceleratorConfigOutSynth } from '../luminarlz/accelerator-config-out-synth';
import { customizationsCdkSynth } from '../luminarlz/customizations-synth';

export class AcceleratorConfigSynth extends Command {
  static paths = [['accelerator-config', 'synth']];

  async execute() {
    await customizationsCdkSynth();
    await acceleratorConfigOutSynth();
    console.log('Done. ✅');
  }
}
