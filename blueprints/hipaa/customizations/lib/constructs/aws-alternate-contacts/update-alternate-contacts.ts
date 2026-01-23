import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Arn, Duration } from 'aws-cdk-lib';
import { ORGANIZATION_ID } from '../../../../config';

const RESOURCE_TYPE = 'Custom::UpdateAlternateContacts';

interface UpdateAlternateContactsProps {
  /**
   * On change the alternate contacts will be updated
   */
  updateTrigger: string;
}

export class UpdateAlternateContacts extends Construct {
  constructor(
    scope: Construct,
    id: string,
    props: UpdateAlternateContactsProps,
  ) {
    super(scope, id);

    const lambdaFunction = new NodejsFunction(this, 'Handler', {
      logRetention: cdk.aws_logs.RetentionDays.ONE_WEEK,
      environment: {},
      timeout: Duration.minutes(5),
    });
    lambdaFunction.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: ['organizations:ListAccounts'],
        resources: ['*'],
      }),
    );
    // allow getting contact information from the management account
    // and update the alternate contact for the management account
    lambdaFunction.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: [
          'account:GetContactInformation',
          'account:PutAlternateContact',
        ],
        resources: [
          Arn.format(
            { service: 'account', resource: 'account', region: '' },
            cdk.Stack.of(this),
          ),
        ],
      }),
    );
    // allow updating the alternate contact for all member accounts in the organization
    lambdaFunction.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: ['account:PutAlternateContact'],
        resources: [
          Arn.format(
            {
              service: 'account',
              resource: 'account',
              resourceName: `${ORGANIZATION_ID}/*`,
              region: '',
            },
            cdk.Stack.of(this),
          ),
        ],
      }),
    );

    const provider = new cdk.custom_resources.Provider(this, 'Provider', {
      onEventHandler: lambdaFunction,
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: RESOURCE_TYPE,
      serviceToken: provider.serviceToken,
      properties: {
        hash: props.updateTrigger,
      },
    });

    /**
     * Singleton pattern to define the log group for the singleton function
     * in the stack
     */
    const stack = cdk.Stack.of(scope);
    const logGroup =
      (stack.node.tryFindChild(
        `${provider.node.id}LogGroup`,
      ) as cdk.aws_logs.LogGroup) ??
      new cdk.aws_logs.LogGroup(stack, `${provider.node.id}LogGroup`, {
        logGroupName: `/aws/lambda/${provider.node.id}`,
        retention: cdk.aws_logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });
    resource.node.addDependency(logGroup);
  }
}
