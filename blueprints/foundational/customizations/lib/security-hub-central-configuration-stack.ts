import { Stack, StackProps } from 'aws-cdk-lib';
import {
  CfnConfigurationPolicy,
  CfnPolicyAssociation,
  CfnFindingAggregator,
} from 'aws-cdk-lib/aws-securityhub';
import { Construct } from 'constructs';
import { HOME_REGION, ENABLED_REGIONS, ROOT_OU_ID } from '../../config';
import { UpdateOrganizationConfiguration } from './constructs/aws-security-hub/update-organization-configuration';

/**
 * Configures AWS Security Hub in the delegated admin account by:
 *
 * - Enabling Security Hub organization-wide
 * - Setting up finding aggregation from other regions
 * - Creating and associating configuration policies with security standards and controls
 *
 * This stack needs to be deployed in the delegated admin account after
 * Security Hub has been configured in the management account.
 */
export class SecurityHubCentralConfigurationStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Set up finding aggregation from other regions excluding the central region
    const findingAggregator = new CfnFindingAggregator(
      this,
      'FindingAggregator',
      {
        regionLinkingMode: 'SPECIFIED_REGIONS',
        regions: ENABLED_REGIONS.filter((region) => region !== HOME_REGION),
      },
    );

    // Enable Security Hub organization-wide
    const configuration = new UpdateOrganizationConfiguration(
      this,
      'SecurityHubUpdateConfiguration',
    );
    configuration.node.addDependency(findingAggregator);

    // Create configuration policy with security standards and controls
    const configurationPolicy = new CfnConfigurationPolicy(
      this,
      'SecurityHubConfigurationPolicy',
      {
        configurationPolicy: {
          securityHub: {
            enabledStandardIdentifiers: [
              'arn:aws:securityhub:eu-central-1::standards/aws-foundational-security-best-practices/v/1.0.0',
            ],
            securityControlsConfiguration: {
              disabledSecurityControlIdentifiers: [
                // We use PassKeys instead of hardware MFA.
                'IAM.6',
                // Disable expensive security feature controls until explicitly requested.
                'Inspector.1',
                'Inspector.2',
                'Inspector.3',
                'Inspector.4',
                'GuardDuty.1',
                'GuardDuty.5',
                'GuardDuty.6',
                'GuardDuty.8',
                'GuardDuty.9',
                'GuardDuty.10',
                'Macie.1',
              ],
            },
            serviceEnabled: true,
          },
        },
        name: 'SecurityHubDefaultConfigurationPolicy',
        description:
          'Enables the AWS Foundational Security Best Practices standard and disables some expensive security feature controls.',
      },
    );
    configurationPolicy.addDependency(findingAggregator);
    configurationPolicy.node.addDependency(configuration);

    // Associate policy with root OU
    new CfnPolicyAssociation(this, 'PolicyAssociation', {
      configurationPolicyId: configurationPolicy.attrId,
      targetId: ROOT_OU_ID,
      targetType: 'ROOT',
    });
  }
}
