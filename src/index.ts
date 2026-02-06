#!/usr/bin/env -S npx ts-node

import { Builtins, Cli } from 'clipanion';
import { Deploy } from './commands/deploy';
import { Doctor } from './commands/doctor';
import { Init } from './commands/init';
import { LzaConfigValidate } from './commands/lza-config-validate';
import { LzaCoreBootstrap } from './commands/lza-core-bootstrap';
import { LzaCustomizationsStackDeploy } from './commands/lza-customizations-stack-deploy';
import { LzaCustomizationsStackSynth } from './commands/lza-customizations-stack-synth';
import { LzaInstallerVersionCheck } from './commands/lza-installer-version-check';
import { LzaInstallerVersionUpdate } from './commands/lza-installer-version-update';
import { LzaStageDeploy } from './commands/lza-stage-deploy';
import { LzaStageSynth } from './commands/lza-stage-synth';
import { Synth } from './commands/synth';

const [, , ...args] = process.argv;

const cli = new Cli({
  binaryLabel: 'AWS Luminarlz CLI',
  binaryName: 'aws-luminarlz-cli',
});
cli.register(Builtins.HelpCommand);
cli.register(LzaCustomizationsStackDeploy);
cli.register(LzaCustomizationsStackSynth);
cli.register(LzaConfigValidate);
cli.register(LzaCoreBootstrap);
cli.register(LzaInstallerVersionCheck);
cli.register(LzaInstallerVersionUpdate);
cli.register(LzaStageDeploy);
cli.register(LzaStageSynth);
cli.register(Synth);
cli.register(Deploy);
cli.register(Doctor);
cli.register(Init);
void cli.runExit(args);
