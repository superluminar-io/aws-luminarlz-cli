import { CfnParameter, Stack, StackProps } from 'aws-cdk-lib';
import { CfnDelegatedAdmin } from 'aws-cdk-lib/aws-securityhub';
import { Construct } from 'constructs';

/**
 * Configures AWS Security Hub in the management account by:
 *
 * Takes a parameter for the delegated admin account ID
 *
 * This stack needs to be deployed in the management account before
 * Security Hub can be configured organization-wide in the delegated admin account.
 */
export class SecurityHubDelegatedAdminStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Register the delegated admin account
    const DelegatedAdminAccountId = new CfnParameter(
      this,
      'DelegatedAdminAccountId',
      {
        type: 'String',
        description:
          'The account id of the Security Hub delegated admin account',
      },
    ).valueAsString;

    new CfnDelegatedAdmin(this, 'DelegatedAdmin', {
      adminAccountId: DelegatedAdminAccountId,
    });
  }
}
