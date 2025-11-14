import { Command } from 'clipanion';
import { synthConfigOut } from '../core/accelerator/config/synth';
import { bootstrapStage, synthStages } from '../core/accelerator/repository/core_cli';
import { customizationsCdkSynth } from '../core/customizations/synth';

export class LzaCoreBootstrap extends Command {
  static paths = [['lza', 'core', 'bootstrap']];

  static usage = Command.Usage({
    category: 'LZA Core',
    description: 'Runs the LZA bootstrap command.',
    details: `
      This includes synthesizing everything as well as bootstrapping the LZA bootstrap stage.
      This will, for example, bootstrap a new AWS region.
    `,
  });

  async execute() {
    await customizationsCdkSynth();
    await synthConfigOut();
    await synthStages({});
    await bootstrapStage();
    console.log(
      'Bootstrapped LZA bootstrap stage. ✅',
    );
  }
}
