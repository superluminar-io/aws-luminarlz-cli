import { Stack, StackProps, aws_securityhub as securityhub } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CfnAutomationRule } from 'aws-cdk-lib/aws-securityhub';
import AutomationRulesFindingFiltersProperty = CfnAutomationRule.AutomationRulesFindingFiltersProperty;

/**
 * Configures AWS Security Hub automation rules in the delegated admin account
 * This stack needs to be deployed in the delegated admin account after
 * Security Hub has been configured with standards and controls.
 */
export class SecurityHubAutomationRulesStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Create automation rules to suppress findings for S3 buckets
    this.suppressLandingZoneResourcesAutomation(
      'AWSFoundationalSecurityBestPracticesSuppressS3',
      'Suppress S3 findings that are part of the landing zone - V2',
      {
        resourceType: [
          {
            value: 'AwsS3Bucket',
            comparison: 'EQUALS',
          },
        ],
        resourceId: [
          {
            value: `arn:aws:s3:::cdk-accel-assets-${this.account}-`,
            comparison: 'CONTAINS',
          },
        ],
      },
    );
  }

  /**
   * Creates an automation rule to suppress findings for resources that are part of the landing zone
   *
   * - Takes a unique identifier for the automation rule as a parameter
   * - Takes a display name for the automation rule as a parameter
   * - Takes filtering criteria as a parameter to identify resources that should be suppressed
   */
  private suppressLandingZoneResourcesAutomation(
    id: string,
    name: string,
    criteria: AutomationRulesFindingFiltersProperty,
  ) {
    const description =
      'Automated suppression of resources that are part of the landing zone.';
    new securityhub.CfnAutomationRule(this, id, {
      actions: [
        {
          findingFieldsUpdate: {
            workflow: {
              status: 'SUPPRESSED',
            },
            // This is not working due to https://github.com/aws/aws-cdk/issues/26749
            // The workaround described in the issue cannot be used because the LZA validation of the CloudFormation template fails
            // note: {
            //   updatedBy: AdministratorTeamName,
            //   text: description,
            // },
          },
          type: 'FINDING_FIELDS_UPDATE',
        },
      ],
      criteria: {
        recordState: [
          {
            value: 'ACTIVE',
            comparison: 'EQUALS',
          },
        ],
        workflowStatus: [
          {
            value: 'NEW',
            comparison: 'EQUALS',
          },
        ],
        ...criteria,
      },
      description,
      isTerminal: false,
      ruleName: name,
      ruleOrder: 1,
      ruleStatus: 'ENABLED',
    });
  }
}
