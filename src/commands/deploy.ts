import { Command, Option } from 'clipanion';
import {
  AWS_ACCELERATOR_PENDING_DEPLOY_FLOW_ENABLED_SSM_PARAMETER_NAME,
  loadConfigSync,
  toPendingConfigArtifactPath,
} from '../config';
import { applyAutoCloudTrailLogGroupName } from '../core/accelerator/config/cloudtrail';
import { publishConfigOut } from '../core/accelerator/config/publish';
import { synthConfigOut } from '../core/accelerator/config/synth';
import {
  findInProgressPipelineExecution,
  formatExecutionDetails,
} from '../core/accelerator/pipeline/execution-guard';
import { isPendingDeployFlowEnabled } from '../core/accelerator/pipeline/pending-flow';
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

    const targetArtifactPath = await this.resolveTargetArtifactPath();
    if (!targetArtifactPath) {
      return;
    }

    await customizationsCdkSynth();
    await synthConfigOut();
    await applyAutoCloudTrailLogGroupName();
    await customizationsPublishCdkAssets();
    await publishConfigOut({ artifactPath: targetArtifactPath });

    const config = loadConfigSync();
    if (targetArtifactPath !== config.awsAcceleratorConfigDeploymentArtifactPath) {
      console.info(
        `Uploaded pending config artifact to ${targetArtifactPath}.`,
      );
    }
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

  private async resolveTargetArtifactPath(): Promise<string | null> {
    const config = loadConfigSync();
    const activeArtifactPath = config.awsAcceleratorConfigDeploymentArtifactPath;
    const inProgressExecution = await findInProgressPipelineExecution();
    if (!inProgressExecution) {
      return activeArtifactPath;
    }

    const pendingDeployFlowEnabled = await isPendingDeployFlowEnabled();
    if (!pendingDeployFlowEnabled) {
      console.info(
        `Deploy aborted: pipeline execution already in progress${formatExecutionDetails(inProgressExecution)}. Pending deploy flow is disabled because ${AWS_ACCELERATOR_PENDING_DEPLOY_FLOW_ENABLED_SSM_PARAMETER_NAME} is missing or false.`,
      );
      return null;
    }

    const pendingArtifactPath = toPendingConfigArtifactPath(activeArtifactPath);
    console.info(
      `Pipeline execution already in progress${formatExecutionDetails(inProgressExecution)}. Pending deploy flow is enabled.`,
    );
    return pendingArtifactPath;
  }
}
