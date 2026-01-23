import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CfnHub } from 'aws-cdk-lib/aws-securityhub';

/**
 * Enables Security Hub.
 * > If the management account does not have Security Hub enabled, you must enable Security Hub for it manually. Security Hub can't be enabled automatically for the organization management account.
 * See: https://docs.aws.amazon.com/securityhub/latest/userguide/designate-orgs-admin-account.html#designate-admin-instructions
 */
export class SecurityHubEnablementStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    new CfnHub(this, 'MyCfnHub', {
      autoEnableControls: false,
      enableDefaultStandards: false,
    });
  }
}
