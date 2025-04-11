import { Construct } from 'constructs';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import {
  AwsCustomResource,
  PhysicalResourceId,
} from 'aws-cdk-lib/custom-resources';

interface EnableAwsServiceAccessProps {
  servicePrincipal: string;
}

export class EnableAwsServiceAccess extends Construct {
  constructor(
    scope: Construct,
    id: string,
    props: EnableAwsServiceAccessProps,
  ) {
    super(scope, id);

    const customResource = new AwsCustomResource(
      this,
      `AWSOrganizationsEnableAWSServiceAccess`,
      {
        onCreate: {
          service: 'Organizations',
          action: 'enableAWSServiceAccess', // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Organizations.html#enableAWSServiceAccess-property
          region: 'us-east-1', // global service
          parameters: {
            ServicePrincipal: props.servicePrincipal,
          },
          physicalResourceId: PhysicalResourceId.of(
            `${props.servicePrincipal}`,
          ),
        },
        onDelete: {
          service: 'Organizations',
          action: 'disableAWSServiceAccess', // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Organizations.html#disableAWSServiceAccess-property
          region: 'us-east-1', // global service
          parameters: {
            ServicePrincipal: props.servicePrincipal,
          },
        },
        policy: {
          statements: [
            new PolicyStatement({
              actions: [
                'organizations:EnableAWSServiceAccess',
                'organizations:DisableAWSServiceAccess',
              ],
              resources: ['*'],
            }),
          ],
        },
      },
    );
  }
}
