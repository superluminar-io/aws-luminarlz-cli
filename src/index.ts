#!/usr/bin/env -S npx ts-node

import { Builtins, Cli } from 'clipanion';
import { AcceleratorConfigPublish } from './commands/accelerator-config-publish';
import { AcceleratorConfigSynth } from './commands/accelerator-config-synth';
import { CustomizationsDeployStack } from './commands/customizations-deploy-stack';
import { CustomizationsPublishCdkAssets } from './commands/customizations-publish-cdk-assets';
import { CustomizationsSynthAcceleratorStack } from './commands/customizations-synth-accelerator-stack';
import { CustomizationsSynthAcceleratorStage } from './commands/customizations-synth-accelerator-stage';
import { Deploy } from './commands/deploy';

const [, , ...args] = process.argv;

const cli = new Cli({
  binaryLabel: 'AWS Landing Zone Accelerator Automaton',
  binaryName: 'aws-luminarlz',
});
cli.register(Builtins.HelpCommand);
cli.register(AcceleratorConfigPublish);
cli.register(AcceleratorConfigSynth);
cli.register(CustomizationsDeployStack);
cli.register(CustomizationsPublishCdkAssets);
cli.register(CustomizationsSynthAcceleratorStack);
cli.register(CustomizationsSynthAcceleratorStage);
cli.register(Deploy);
void cli.runExit(args);
