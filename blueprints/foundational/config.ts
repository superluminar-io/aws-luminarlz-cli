import {
  baseConfig,
  Config,
  GLOBAL_REGION,
  Template,
} from '@superluminar-io/aws-luminarlz-cli/lib/config';

/**
 * The deployed version of the AWS Landing zone accelerator.
 */
export const AWS_ACCELERATOR_VERSION = '<<AWS_ACCELERATOR_VERSION>>';

/**
 * The AWS management account, organization and root organizational unit used in this project.
 */
export const MANAGEMENT_ACCOUNT_ID = '<<AWS_MANAGEMENT_ACCOUNT_ID>>';
export const ORGANIZATION_ID = '<<AWS_ORGANIZATION_ID>>';
export const ROOT_OU_ID = '<<AWS_ROOT_OU_ID>>';

/**
 * The email address used for the AWS accounts root emails.
 * Sub-addressing is used to create unique root email addresses for each account, e.g: aws+management@example.org.
 * Some email servers (e.g., MS Outlook) need this feature to be explicitly enabled.
 */
export const AWS_ACCOUNTS_ROOT_EMAIL = '<<AWS_ACCOUNTS_ROOT_EMAIL>>';
/**
 * The email address used for the AWS alternate contact emails.
 * TODO: Optionally, we can uncomment this to use the alternate contact email as alternate contact.
 */
// export const AWS_ALTERNATE_CONTACT_EMAIL = '<AWS_ALTERNATE_CONTACT_EMAIL>';

/**
 * The GitHub Actions organization, repository, and branch to which access is granted to deploy the accelerator-config zip file.
 * TODO: Optionally, we can uncomment this to grant GitHub Actions access to update the accelerator-config zip file and to upload CDK assets.
 */
// export const GITHUB_ORGANIZATION = '<GITHUB_ORGANIZATION>';
// export const GITHUB_REPOSITORY = 'aws-landing-zone';
// export const GITHUB_REPOSITORY_MAIN_BRANCH = 'main';

/**
 * The AWS regions in use. The global region is always us-east-1.
 */
export const HOME_REGION = '<<AWS_HOME_REGION>>';
export const ENABLED_REGIONS = [GLOBAL_REGION, HOME_REGION];

/**
 * The groups should be aligned with the groups in the AWS IAM Identity Center.
 * The group names are also being used for the Owner Cost Category and as possible values for the Owner tag.
 * TODO: The group values should be replaced with IAM Identity Center group names that actually exist in your project!
 */
export const Groups = {
  awsAdministrator: 'aws-administrator',
  awsDeveloper: 'aws-developer',
  awsBillingReviewer: 'aws-billing',
};
export type Group = (typeof Groups)[keyof typeof Groups];

/**
 * The organizational units are deployed and managed via the LZA.
 * They are also used for the OrganizationalUnit Cost Category.
 */
interface OrganizationalUnit {
  name: string;
  ignore?: boolean;
}
const organizationalUnits: OrganizationalUnit[] = [
  {
    name: 'Suspended',
    ignore: true,
  },
  {
    name: 'Security',
  },
  {
    name: 'Infrastructure',
  },
  {
    name: 'Workloads',
  },
  {
    name: 'Workloads/Production',
  },
  {
    name: 'Workloads/Test',
  },
  {
    name: 'Sandbox',
  },
];

/**
 * The environments are used for the Environment Cost Category and as possible values for the Environment tag.
 */
export const environments = {
  production: 'production',
  test: 'test',
} as const;
export type Environment = (typeof environments)[keyof typeof environments];

/**
 * Add a sub-addressing infix to the email address.
 * @param email
 * @param subAddress
 */
function withSubAddress(email: string, subAddress: string): string {
  const [localPart, domain] = email.split('@');
  return `${localPart}+${subAddress}@${domain}`;
}

/**
 * The accounts are deployed and managed via the LZA.
 * The LZA has the concept of Mandatory and Workload accounts. Not to be confused with accounts in the Workloads OU.
 * Mandatory accounts are required for the LZA to work and shouldn't be removed.
 * Workload accounts are optional and can be added as needed.
 * To remove a Workload account, you need to manually move it to the Suspended OU (or any other ignored OU) before removing it here.
 */
export interface Account {
  /**
   * The name of the AWS account.
   */
  name: string;
  /**
   * The root email of the AWS account.
   */
  email: string;
  /**
   * The organizational unit of the AWS account that is configured in AWS Organizations.
   */
  organizationalUnit: string;
  /**
   * Used e.g., to configure AWS Cost Categories.
   */
  environment: Environment;
  /**
   * Defines the adminstrator assignment for the account.
   */
  owner: Group;
  /**
   * Used as a contact for operations, billing, and security notifications.
   */
  alternateContactEmail?: string;
}
interface MandatoryAccount extends Account {
  name: 'Management' | 'LogArchive' | 'Audit';
}
const mandatoryAccounts: MandatoryAccount[] = [
  {
    name: 'Management',
    email: withSubAddress(AWS_ACCOUNTS_ROOT_EMAIL, 'management'),
    organizationalUnit: 'Root',
    environment: 'production',
    owner: Groups.awsAdministrator,
  },
  {
    name: 'LogArchive',
    email: withSubAddress(AWS_ACCOUNTS_ROOT_EMAIL, 'security-log-archive'),
    organizationalUnit: 'Security',
    environment: 'production',
    owner: Groups.awsAdministrator,
  },
  {
    name: 'Audit',
    email: withSubAddress(AWS_ACCOUNTS_ROOT_EMAIL, 'security-audit'),
    organizationalUnit: 'Security',
    environment: 'production',
    owner: Groups.awsAdministrator,
  },
];
const workloadAccounts: Account[] = [
  // AWS Account where production workloads are deployed.
  {
    name: 'Production',
    email: withSubAddress(AWS_ACCOUNTS_ROOT_EMAIL, 'workloads-production'),
    organizationalUnit: 'Workloads/Production',
    // TODO: Optionally, we can uncomment this to use the alternate contact email as alternate contact.
    // alternateContactEmail: withSubAddress(AWS_ALTERNATE_CONTACT_EMAIL, 'workloads-production'),
    environment: 'production',
    owner: Groups.awsDeveloper,
  },
  // AWS Account where test workloads are deployed.
  {
    name: 'Test',
    email: withSubAddress(AWS_ACCOUNTS_ROOT_EMAIL, 'workloads-test'),
    organizationalUnit: 'Workloads/Test',
    // TODO: Optionally, we can uncomment this to use the alternate contact email as alternate contact.
    // alternateContactEmail: withSubAddress(AWS_ALTERNATE_CONTACT_EMAIL, 'workloads-test'),
    environment: 'test',
    owner: Groups.awsDeveloper,
  },
  // AWS Account where network configurations are deployed, e.g.: AWS Route53, Amazon VPC IP Address Manager (IPAM), AWS Transit Gateway.
  {
    name: 'Network',
    email: withSubAddress(AWS_ACCOUNTS_ROOT_EMAIL, 'infrastructure-network'),
    organizationalUnit: 'Infrastructure',
    // TODO: Optionally, we can uncomment this to use the alternate contact email as alternate contact.
    // alternateContactEmail: withSubAddress(AWS_ALTERNATE_CONTACT_EMAIL, 'infrastructure-network'),
    environment: 'production',
    owner: Groups.awsDeveloper,
  },
];
export const AllAccounts = [...mandatoryAccounts, ...workloadAccounts];

/**
 * The email address used to send notifications from the management account.
 */
export const MANAGEMENT_NOTIFICATIONS_EMAIL = withSubAddress(
  AWS_ACCOUNTS_ROOT_EMAIL,
  'management-notifications',
);

/**
 * This defines the Liquidjs templates and their parameters.
 * They'll be part of the generated `aws-accelerator-config.out` directory.
 */
export const templates: Template[] = [
  {
    fileName: 'accounts-config.yaml',
    parameters: {
      managementAccount: mandatoryAccounts.find(
        (account) => account.name === 'Management',
      ),
      logArchiveAccount: mandatoryAccounts.find(
        (account) => account.name === 'LogArchive',
      ),
      auditAccount: mandatoryAccounts.find(
        (account) => account.name === 'Audit',
      ),
      workloadAccounts,
    },
  },
  {
    fileName: 'customizations-config.yaml',
    parameters: {
      homeRegion: HOME_REGION,
      globalRegion: GLOBAL_REGION,
      enabledRegions: ENABLED_REGIONS,
    },
  },
  {
    fileName: 'global-config.yaml',
    parameters: {
      homeRegion: HOME_REGION,
      globalRegion: GLOBAL_REGION,
      enabledRegions: ENABLED_REGIONS,
      managementNotificationsEmail: MANAGEMENT_NOTIFICATIONS_EMAIL,
      owner: Groups.awsAdministrator,
    },
  },
  {
    fileName: 'iam-config.yaml',
    parameters: {
      iamIdAwsAdministratorGroupName: Groups.awsAdministrator,
      iamIdAwsBillingReviewerGroupName: Groups.awsBillingReviewer,
      accountAdministrators: workloadAccounts.map((account) => ({
        accountName: account.name,
        groupName: account.owner,
      })),
    },
  },
  {
    fileName: 'network-config.yaml',
    parameters: {
      homeRegion: HOME_REGION,
    },
  },
  {
    fileName: 'organization-config.yaml',
    parameters: {
      organizationalUnits,
    },
  },
  {
    fileName: 'security-config.yaml',
    parameters: {
      homeRegion: HOME_REGION,
    },
  },
  {
    fileName: 'tagging-policies/default-tag-policy.json',
    parameters: {
      owners: Object.values(Groups),
      environments: Object.values(environments),
    },
  },
];

export const config: Config = {
  ...baseConfig,
  templates,
  environments,
  managementAccountId: MANAGEMENT_ACCOUNT_ID,
  homeRegion: HOME_REGION,
  enabledRegions: ENABLED_REGIONS,
  awsAcceleratorVersion: AWS_ACCELERATOR_VERSION,
};
