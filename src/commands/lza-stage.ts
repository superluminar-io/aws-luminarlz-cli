import { Command, Option } from 'clipanion';

export abstract class LzaStage extends Command {
  static namespacePath = ['lza', 'stage'];
  static category = 'LZA Stage';

  stage = Option.String('--stage', {
    description: `
      The AWS Accelerator pipeline stage to be synthesized & deployed. Defaults to \`customizations\`.\n
      Stage names can be found in the accelerator-stage.ts file:\n
      https://github.com/awslabs/landing-zone-accelerator-on-aws/blob/main/source/packages/%40aws-accelerator/accelerator/lib/accelerator-stage.ts\n
      You can find an overview of the different stages in the Landing Zone Accelerator on AWS pipeline documentation:\n
      https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/awsaccelerator-pipeline.html
    `,
  });

  protected get stageOrDefault() {
    return this.stage ?? 'customizations';
  }

  abstract execute(): Promise<void>;
}