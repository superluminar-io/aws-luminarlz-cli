import * as cdk from 'aws-cdk-lib';
import { Arn } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import {
  CfnOIDCProvider,
  FederatedPrincipal,
  PolicyStatement,
  Role,
} from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import {
  awsAcceleratorConfigBucketName,
  cdkAccelAssetsBucketNamePrefix,
  AWS_ACCELERATOR_PIPELINE_FAILURE_TOPIC_NAME,
  AWS_ACCELERATOR_SSM_PARAMETER_INSTALLER_KMS_KEY_ARN,
} from '@superluminar-io/aws-luminarlz-cli/lib/config';
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId,
} from 'aws-cdk-lib/custom-resources';
import { config, MANAGEMENT_NOTIFICATIONS_EMAIL } from '../../config';

/**
 * Configures additions for the AWS Accelerator deployment pipeline:
 *  - Trigger the pipeline if the s3 accelerator-config zip file has been updated.
 *  - Send failure notifications to the notification email address.
 *  - Grant CD pipeline access to update the accelerator-config zip file.
 *  - Grant CD pipeline access to upload CDK assets.
 */
export class AwsAcceleratorPipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.s3Trigger();
    this.failureNotifications();
    // TODO: Optionally, we can uncomment this to grant GitHub Actions access to update the accelerator-config zip file and to upload CDK assets.
    // this.githubActionsOidcAwsAcceleratorDeploymentAccess();
  }

  // TODO: Optionally, we can uncomment this to grant GitHub Actions access to update the accelerator-config zip file and to upload CDK assets.
  // private githubActionsOidcAwsAcceleratorDeploymentAccess() {
  //   const cfnOidcProvider = new CfnOIDCProvider(
  //     this,
  //     'GitLabOpenIdConnectProvider',
  //     {
  //       url: 'https://token.actions.githubusercontent.com',
  //       clientIdList: ['sts.amazonaws.com'],
  //       // Although this is not required for the OIDC provider, we can have to add the thumbprint list
  //       // because otherwise the Cloudformation update will fail.
  //       // See also: https://github.com/aws-cloudformation/cloudformation-coverage-roadmap/issues/2092
  //       thumbprintList: ['d89e3bd43d5d909b47a18977aa9d5ce36cee184c'],
  //     },
  //   );
  //
  //   const installerKmsKeyArn = ssm.StringParameter.fromStringParameterName(
  //     this,
  //     'AcceleratorInstallerKmsKeyArn',
  //     AWS_ACCELERATOR_SSM_PARAMETER_INSTALLER_KMS_KEY_ARN,
  //   ).stringValue;
  //
  //   const role = new Role(this, 'GitHubRole', {
  //     roleName: 'github-actions-role',
  //     assumedBy: new FederatedPrincipal(
  //       cfnOidcProvider.attrArn,
  //       {
  //         StringLike: {
  //           'token.actions.githubusercontent.com:sub': `repo:${GITHUB_ORGANIZATION}/${GITHUB_REPOSITORY}:ref:refs/heads/${GITHUB_REPOSITORY_MAIN_BRANCH}`,
  //         },
  //         StringEquals: {
  //           'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
  //         },
  //       },
  //       'sts:AssumeRoleWithWebIdentity',
  //     ),
  //     inlinePolicies: {
  //       GenerateDatakey: new iam.PolicyDocument({
  //         statements: [
  //           new PolicyStatement({
  //             effect: iam.Effect.ALLOW,
  //             actions: ['kms:GenerateDataKey'],
  //             resources: [installerKmsKeyArn],
  //           }),
  //         ],
  //       }),
  //     },
  //   });
  //
  //   const configBucketName = awsAcceleratorConfigBucketName(config);
  //   const configBucket = s3.Bucket.fromBucketName(
  //     this,
  //     'Bucket',
  //     configBucketName,
  //   );
  //   configBucket.grantPut(
  //     role,
  //     config.awsAcceleratorConfigDeploymentArtifactPath,
  //   );
  //
  //   config.enabledRegions.forEach((region) => {
  //     const cdkAccelBucketName = `${cdkAccelAssetsBucketNamePrefix(config)}${region}`;
  //     const cdkAccelBucket = s3.Bucket.fromBucketName(
  //       this,
  //       `Bucket-${cdkAccelBucketName}`,
  //       cdkAccelBucketName,
  //     );
  //     cdkAccelBucket.grantPut(role, `${config.customizationPath}/*`);
  //     role.addToPolicy(
  //       new PolicyStatement({
  //         actions: ['s3:getBucketLocation', 's3:ListBucket'],
  //         resources: [cdkAccelBucket.bucketArn],
  //       }),
  //     );
  //   });
  // }

  private failureNotifications() {
    sns.Topic.fromTopicArn(
      this,
      'PipelineFailureTopic',
      Arn.format(
        {
          service: 'sns',
          resource: AWS_ACCELERATOR_PIPELINE_FAILURE_TOPIC_NAME,
        },
        this,
      ),
    ).addSubscription(
      new subscriptions.EmailSubscription(MANAGEMENT_NOTIFICATIONS_EMAIL),
    );
  }

  private s3Trigger() {
    const bucketName = awsAcceleratorConfigBucketName(config);
    new AwsCustomResource(this, 'S3BucketNotificationConfiguration', {
      onUpdate: {
        service: 's3',
        action: 'PutBucketNotificationConfiguration',
        parameters: {
          Bucket: bucketName,
          NotificationConfiguration: {
            EventBridgeConfiguration: {},
          },
        },
        physicalResourceId: PhysicalResourceId.of(
          'S3BucketNotificationConfiguration',
        ),
      },
      onDelete: {
        service: 's3',
        action: 'PutBucketNotificationConfiguration',
        parameters: {
          Bucket: bucketName,
          NotificationConfiguration: {},
        },
      },
      policy: AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['s3:PutBucketNotification*'],
          resources: [
            Arn.format({
              service: 's3',
              resource: bucketName,
              account: '',
              region: '',
              partition: this.partition,
            }),
          ],
        }),
      ]),
    });

    const pipeline = codepipeline.Pipeline.fromPipelineArn(
      this,
      'Pipeline',
      Arn.format(
        {
          service: 'codepipeline',
          resource: config.awsAcceleratorPipelineName,
        },
        this,
      ),
    );

    new iam.Role(this, 'Role', {
      assumedBy: new iam.ServicePrincipal('events.amazonaws.com'),
      inlinePolicies: {
        'eb-pipeline-execution': new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ['codepipeline:StartPipelineExecution'],
              resources: [pipeline.pipelineArn],
            }),
          ],
        }),
      },
    });

    const rule = new events.Rule(this, 'ConfigBucketNotificationsRule', {
      eventPattern: {
        source: ['aws.s3'],
        detailType: ['Object Created'],
        detail: {
          bucket: {
            name: [bucketName],
          },
        },
      },
    });
    rule.addTarget(new targets.CodePipeline(pipeline));
  }
}
