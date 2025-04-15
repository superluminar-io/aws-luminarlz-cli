#!/usr/bin/env -S npx ts-node

import { Builtins, Cli } from 'clipanion';
import { Deploy } from './commands/deploy';
import { LzaConfigValidate } from './commands/lza-config-validate';
import { LzaCustomizationsStackDeploy } from './commands/lza-customizations-stack-deploy';
import { LzaCustomizationsStackSynth } from './commands/lza-customizations-stack-synth';
import { LzaInstallerVersionCheck } from './commands/lza-installer-version-check';
import { LzaInstallerVersionUpdate } from './commands/lza-installer-version-update';
import { LzaStageSynth } from './commands/lza-stage-synth';
import { Synth } from './commands/synth';

const [, , ...args] = process.argv;

const cli = new Cli({
  binaryLabel: 'AWS Landing Zone Accelerator Automaton',
  binaryName: 'aws-luminarlz-cli',
});
cli.register(Builtins.HelpCommand);
cli.register(LzaCustomizationsStackDeploy);
cli.register(LzaCustomizationsStackSynth);
cli.register(LzaConfigValidate);
cli.register(LzaInstallerVersionCheck);
cli.register(LzaInstallerVersionUpdate);
cli.register(LzaStageSynth);
cli.register(Synth);
cli.register(Deploy);
void cli.runExit(args);
