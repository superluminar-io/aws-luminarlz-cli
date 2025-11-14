import * as cdk from 'aws-cdk-lib';
import { AwsAcceleratorPipelineStack } from '../lib/aws-accelerator-pipeline-stack';
import { Tags } from 'aws-cdk-lib';
import { CliCredentialsStackSynthesizer } from '../lib/synthesizer/cli-credentials-stack-synthesizer';
import { cdkAccelAssetsBucketNamePrefix } from '@superluminar-io/aws-luminarlz-cli/lib/config';
import { config, Groups } from '../../config';
import { CostCategoriesStack } from '../lib/cost-categories-stack';
import { AlternateContactsStack } from '../lib/alternate-contacts-stack';
import { SecurityHubDelegatedAdminStack } from '../lib/security-hub-delegated-admin-stack';
import { SecurityHubCentralConfigurationStack } from '../lib/security-hub-central-configuration-stack';
import { SecurityHubAutomationRulesStack } from '../lib/security-hub-automation-rules-stack';
import { SecurityHubEnablementStack } from '../lib/security-hub-enablement-stack';
import { OrganizationsServiceAccessStack } from '../lib/organizations-service-access-stack';

// The CliCredentialsStackSynthesizer enables the synthesis of stacks that are account and environment agnostic.
const defaultStackSynthesizer = new CliCredentialsStackSynthesizer({
  bucketPrefix: `${config.customizationPath}/`,
  fileAssetsBucketName: `${cdkAccelAssetsBucketNamePrefix(config)}\${AWS::Region}`,
});

const StackPrefix = 'LzaCustomization-';

const app = new cdk.App({
  defaultStackSynthesizer,
  analyticsReporting: false,
});
new OrganizationsServiceAccessStack(
  app,
  `${StackPrefix}OrganizationsServiceAccess`,
);
new AwsAcceleratorPipelineStack(app, `${StackPrefix}AwsAcceleratorPipeline`);
new CostCategoriesStack(app, `${StackPrefix}CostCategories`);
new AlternateContactsStack(app, `${StackPrefix}AlternateContacts`);

/**
 * Custom Security Hub setup.
 * LZA does not support Central Configuration yet, so it is configured here.
 * TODO: Uncomment this to set up a foundational Security Hub configuration.
 */
// new SecurityHubEnablementStack(app, `${StackPrefix}SecurityHubEnablement`, {
//   ...props,
// });
// new SecurityHubDelegatedAdminStack(
//   app,
//   `${StackPrefix}SecurityHubDelegatedAdmin`,
// );
// new SecurityHubCentralConfigurationStack(
//   app,
//   `${StackPrefix}SecurityHubCentralConfiguration`,
// );
// new SecurityHubAutomationRulesStack(
//   app,
//   `${StackPrefix}SecurityHubAutomationRules`,
// );

Tags.of(app).add('Owner', Groups.awsAdministrator);
