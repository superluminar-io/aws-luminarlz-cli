import { Command } from 'clipanion';
import { LzaStage } from './lza-stage';
import { synthConfigOut } from '../core/accelerator/config/synth';
import { synthStages } from '../core/accelerator/repository/core_cli';
import { customizationsCdkSynth } from '../core/customizations/synth';

export class LzaStageSynth extends LzaStage {
  static paths = [[...super.namespacePath, 'synth']];

  static usage = Command.Usage({
    category: super.category,
    description: 'Synthesize a LZA stage.',
    details: `
      This includes synthesizing everything as well as the LZA stage.
    `,
  });

  async execute() {
    const stage = this.stageOrDefault;
    await customizationsCdkSynth();
    await synthConfigOut();
    await synthStages({
      stage,
    });
    console.log(
      `Synthesized LZA ${stage} stage. ✅`,
    );
  }
}
