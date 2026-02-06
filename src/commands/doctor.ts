import { Command, Option } from 'clipanion';
import { runDoctor } from '../core/doctor/doctor';
import { printDoctorSummary } from '../core/doctor/printer';

export class Doctor extends Command {
  static paths = [['doctor']];

  static usage = Command.Usage({
    description: 'Checks prerequisites for an LZA deploy (preflight).',
  });

  fixtures = Option.String('--fixtures', {
    description: 'Path to a JSON fixture for offline tests.',
  });
  only = Option.String('--only', {
    description: 'Comma-separated list of check ids to run (e.g. aws-identity,config-bucket).',
  });

  async execute() {
    const only = this.only
      ? this.only.split(',').map((value) => value.trim()).filter(Boolean)
      : [];
    const summary = await runDoctor({
      fixturesPath: this.fixtures,
      only,
    });

    if (this.fixtures) {
      console.info('FIXTURE MODE: No AWS calls were made.');
      console.info('---');
    }
    const lines = printDoctorSummary(summary);
    for (const line of lines) {
      console.info(line);
    }
    return summary.hasFailures ? 1 : 0;
  }
}
