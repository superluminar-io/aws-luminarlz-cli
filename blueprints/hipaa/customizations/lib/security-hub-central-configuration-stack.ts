import { Arn, ArnFormat, Stack, StackProps } from 'aws-cdk-lib';
import {
  CfnConfigurationPolicy,
  CfnPolicyAssociation,
  CfnFindingAggregator,
} from 'aws-cdk-lib/aws-securityhub';
import { Construct } from 'constructs';
import { HOME_REGION, ENABLED_REGIONS, ROOT_OU_ID } from '../../config';
import { UpdateOrganizationConfiguration } from './constructs/aws-security-hub/update-organization-configuration';

/**
  * Properties for SecurityHubCentralConfigurationStack
  */
export interface SecurityHubCentralConfigurationStackProps extends StackProps {
  /**
   * List of accounts or OUs to disable Security Hub for.
   */
  readonly disableSecurityHubForTargets?: { id: string, type: 'ACCOUNT' | 'ORGANIZATIONAL_UNIT' }[];
}

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
  constructor(scope: Construct, id: string, props?: SecurityHubCentralConfigurationStackProps) {
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
              Arn.format({
                partition: this.partition,
                service: 'securityhub',
                region: this.region,
                account: '',
                resource: 'standards',
                resourceName: 'aws-security-best-practices/v/1.0.0',
                arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
              }),
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
    const rootAssociation = new CfnPolicyAssociation(this, 'PolicyAssociation', {
      configurationPolicyId: configurationPolicy.attrId,
      targetId: ROOT_OU_ID,
      targetType: 'ROOT',
    });

    props?.disableSecurityHubForTargets?.forEach((target, index) => {
      const association = new CfnPolicyAssociation(this, `DisableSecurityHubAssociation${index}`, {
        configurationPolicyId: 'SELF_MANAGED_SECURITY_HUB',
        targetId: target.id,
        targetType: target.type,
      });
      rootAssociation.node.addDependency(association);
    });
  }
}
