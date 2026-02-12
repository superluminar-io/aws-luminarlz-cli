import {
  CodePipelineClient,
  ListPipelineExecutionsCommand,
  PipelineExecutionSummary,
} from '@aws-sdk/client-codepipeline';
import { loadConfigSync } from '../../../config';

const IN_PROGRESS_STATUS = 'InProgress';

const isExecutionInProgress = (execution: PipelineExecutionSummary): boolean =>
  execution.status === IN_PROGRESS_STATUS;

export const formatExecutionDetails = (execution: PipelineExecutionSummary): string => {
  if (execution.pipelineExecutionId) {
    return ` (execution ${execution.pipelineExecutionId})`;
  }
  return '';
};

export const findInProgressPipelineExecution = async (): Promise<PipelineExecutionSummary | null> => {
  const config = loadConfigSync();
  const client = new CodePipelineClient({ region: config.homeRegion });

  const response = await client.send(new ListPipelineExecutionsCommand({
    pipelineName: config.awsAcceleratorPipelineName,
  }));

  const summaries = response.pipelineExecutionSummaries ?? [];
  return summaries.find(isExecutionInProgress) ?? null;
};

export const abortIfPipelineExecutionInProgress = async (): Promise<boolean> => {
  const execution = await findInProgressPipelineExecution();
  if (!execution) {
    return false;
  }

  console.info(
    `Deploy aborted: pipeline execution already in progress${formatExecutionDetails(execution)}.`,
  );
  return true;
};
