import fs from 'fs';
import path from 'node:path';
import * as organizations from '@aws-sdk/client-organizations';
import * as ssoAdmin from '@aws-sdk/client-sso-admin';
import * as sts from '@aws-sdk/client-sts';
import { Liquid } from 'liquidjs';
import { getVersion } from '../accelerator/installer/installer';
import { resolveProjectPath } from '../util/path';

const buildBlueprintPath = (blueprintName: string) => {
  return path.join(__dirname, '..', '..', '..', 'blueprints', blueprintName);
};

export const blueprintExists = (blueprintName: string) => {
  return !fs.existsSync(buildBlueprintPath(blueprintName));
};

const getAwsAccountId = async (region: string) => {
  const client = new sts.STSClient({ region });
  const { Account } = await client.send(new sts.GetCallerIdentityCommand());
  if (!Account) {
    throw new Error('Unable to get AWS account ID');
  }
  return Account;
};

const getOrganizationId = async (region: string) => {
  const client = new organizations.OrganizationsClient({ region });
  const { Organization } = await client.send(new organizations.DescribeOrganizationCommand());
  if (!Organization?.Id) {
    throw new Error('Unable to get AWS organization ID');
  }
  return Organization.Id;
};

const getRootOuId = async (region: string) => {
  const client = new organizations.OrganizationsClient({ region });
  const { Roots } = await client.send(new organizations.ListRootsCommand());
  if (Roots?.length !== 1) {
    throw new Error('There should be only one root in the organization');
  }
  if (!Roots[0]?.Id) {
    throw new Error('Unable to get AWS root OU ID');
  }
  return Roots[0].Id;
};

const getIdentityStoreId = async (region: string) => {
  const client = new ssoAdmin.SSOAdminClient({ region });
  const { Instances } = await client.send(new ssoAdmin.ListInstancesCommand({}));
  if (Instances?.length !== 1) {
    throw new Error('There should be only one identity store in the organization');
  }
  if (!Instances[0]?.IdentityStoreId) {
    throw new Error('Unable to get AWS identity store ID');
  }
  return Instances[0].IdentityStoreId;
};

export const renderBlueprint = async (blueprintName: string, { forceOverwrite, accountsRootEmail, region }: {
  forceOverwrite: boolean;
  accountsRootEmail: string;
  region: string;
}) => {
  const managementAccountId = await getAwsAccountId(region);
  const installerVersion = await getVersion(region);
  const organizationId = await getOrganizationId(region);
  const rootOuId = await getRootOuId(region);
  const identityStoreId = await getIdentityStoreId(region);

  const projectRoot = resolveProjectPath();
  const blueprintRoot = buildBlueprintPath(blueprintName);
  const liquid = new Liquid({
    root: blueprintRoot,
    // fail on undefined variables
    strictVariables: true,
    strictFilters: true,
    // use custom delimiters to avoid conflicts with other templating engines
    tagDelimiterLeft: '<<%',
    tagDelimiterRight: '%>>',
    outputDelimiterLeft: '<<',
    outputDelimiterRight: '>>',
  });
  // when testing locally, there might be node dependencies we just ignore them.
  const filePathes = (await fs.promises.readdir(blueprintRoot, {
    recursive: true,
  })).filter((fp) => !fp.includes('node_modules')
    && !fp.includes('package-lock.json')
    && !fp.includes('yarn.lock')
    && !fp.includes('pnpm-lock.yaml'));
  // Copy and render all blueprint files to the project root
  for (const filePath of filePathes) {
    const source = path.join(blueprintRoot, filePath);
    const target = path.join(projectRoot, filePath);
    // If is a directory, ensure to create it in the project root
    if (fs.lstatSync(source).isDirectory()) {
      // Create the directory in the output path if it doesn't exist
      if (!fs.existsSync(target)) {
        fs.mkdirSync(target);
      }
    } else {
      // render the file
      const output = liquid.renderFileSync(
        filePath,
        {
          AWS_ACCELERATOR_VERSION: installerVersion,
          AWS_MANAGEMENT_ACCOUNT_ID: managementAccountId,
          AWS_ORGANIZATION_ID: organizationId,
          AWS_ROOT_OU_ID: rootOuId,
          AWS_ACCOUNTS_ROOT_EMAIL: accountsRootEmail,
          AWS_HOME_REGION: region,
          AWS_IDENTITY_STORE_ID: identityStoreId,
        },
      );
      // if a target file already exists, skip it until force overwrite is enabled
      if (!forceOverwrite && fs.existsSync(target)) {
        console.log(`Skipping ${target} because it already exists.`);
        continue;
      }
      fs.writeFileSync(target, output);
    }
  }
  return {
    managementAccountId,
    organizationId,
    rootOuId,
    accountsRootEmail: accountsRootEmail,
    installerVersion,
    region,
  };
};