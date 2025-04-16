import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { ManagedPolicy, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Provider } from 'aws-cdk-lib/custom-resources';
import {
  CustomResource,
  Duration,
  Fn,
  RemovalPolicy,
  Stack,
} from 'aws-cdk-lib';

export class UpdateOrganizationConfiguration extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const RESOURCE_TYPE = 'Custom::UpdateOrganizationConfiguration';

    const lambdaFunction = new NodejsFunction(this, 'Handler', {
      logRetention: RetentionDays.ONE_WEEK,
      timeout: Duration.minutes(15),
    });

    lambdaFunction.addToRolePolicy(
      new PolicyStatement({
        actions: [
          'securityhub:UpdateOrganizationConfiguration',
          'securityhub:DescribeOrganizationConfiguration',
        ],
        resources: [
          Fn.sub(
            // eslint-disable-next-line no-template-curly-in-string
            'arn:aws:securityhub:${AWS::Region}:${AWS::AccountId}:hub/default',
          ),
        ],
      }),
    );
    // There are some undocumented permissions required for the UpdateOrganizationConfiguration API call.
    // See: https://repost.aws/questions/QUYyAne_-FROy5HSNoOdrVnw/enabling-securityhub-central-configuration-accessdeniedexception
    lambdaFunction.role?.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName(
        'AWSSecurityHubOrganizationsAccess',
      ),
    );

    const provider = new Provider(
      this,
      'UpdateOrganizationConfigurationProvider',
      {
        onEventHandler: lambdaFunction,
      },
    );

    const resource = new CustomResource(this, 'Resource', {
      resourceType: RESOURCE_TYPE,
      serviceToken: provider.serviceToken,
    });

    /**
     * Singleton pattern to define the log group for the singleton function
     * in the stack
     */
    const stack = Stack.of(scope);
    const logGroup =
      (stack.node.tryFindChild(`${provider.node.id}LogGroup`) as LogGroup) ??
      new LogGroup(stack, `${provider.node.id}LogGroup`, {
        logGroupName: `/aws/lambda/${provider.node.id}`,
        retention: 7,
        removalPolicy: RemovalPolicy.DESTROY,
      });
    resource.node.addDependency(logGroup);
  }
}
