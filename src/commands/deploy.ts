import { Command, Option } from 'clipanion';
import {
  loadConfigSync,
} from '../config';
import { applyAutoCloudTrailLogGroupName } from '../core/accelerator/config/cloudtrail';
import { publishConfigOut } from '../core/accelerator/config/publish';
import { synthConfigOut } from '../core/accelerator/config/synth';
import { ensureCheckoutExists } from '../core/accelerator/repository/checkout';
import { customizationsPublishCdkAssets } from '../core/customizations/assets';
import { customizationsCdkSynth } from '../core/customizations/synth';
import { runDoctor } from '../core/doctor/doctor';
import { writeDoctorSummary } from '../core/doctor/printer';

export class Deploy extends Command {
  static paths = [['deploy']];

  static usage = Command.Usage({
    description: 'Synth and publish everything!',
  });

  skipDoctor = Option.Boolean('--skip-doctor', {
    description: 'Skip the doctor preflight checks.',
  });

  async execute() {
    const canContinue = await this.runDoctorPreflight();
    if (!canContinue) {
      return;
    }

    const config = loadConfigSync();
    await customizationsCdkSynth();
    await synthConfigOut();
    await applyAutoCloudTrailLogGroupName();
    await customizationsPublishCdkAssets();
    await publishConfigOut({
      artifactPath: config.awsAcceleratorConfigDeploymentArtifactPath,
    });
    console.info('Done. ✅');
  }

  private async runDoctorPreflight(): Promise<boolean> {
    if (this.skipDoctor) {
      return true;
    }
    await ensureCheckoutExists();
    const summary = await runDoctor();
    writeDoctorSummary(summary);
    if (summary.hasFailures) {
      console.info('Deploy aborted: doctor checks failed.');
      return false;
    }
    return true;
  }
}
