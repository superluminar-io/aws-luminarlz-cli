import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { EnableAwsServiceAccess } from './constructs/aws-organizations/enable-aws-service-access';

/**
 * Enable necessary trusted access for AWS services.
 */
export class OrganizationsServiceAccessStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    new EnableAwsServiceAccess(this, 'EnableAccountManagementAccess', {
      servicePrincipal: 'account.amazonaws.com',
    });
  }
}
