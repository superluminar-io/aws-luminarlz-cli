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

const DEFAULT_BLUEPRINT_DIRECTORY = 'foundational';

export const blueprintExists = (blueprintName: string = DEFAULT_BLUEPRINT_DIRECTORY) => {
  return fs.existsSync(buildBlueprintPath(blueprintName));
};

export interface BlueprintTemplateContext {
  managementAccountId: string;
  installerVersion: string;
  organizationId: string;
  rootOuId: string;
  identityStoreId: string;
  accountsRootEmail: string;
  region: string;
}

export interface BlueprintRenderInputs {
  accountsRootEmail: string;
  region: string;
}

export interface RenderedBlueprintFile {
  relativePath: string;
  targetPath: string;
  content: string;
}

export interface BlueprintRenderOutput {
  templateContext: BlueprintTemplateContext;
  files: RenderedBlueprintFile[];
}

export interface BlueprintRenderResult {
  managementAccountId: string;
  organizationId: string;
  rootOuId: string;
  accountsRootEmail: string;
  installerVersion: string;
  region: string;
}

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

const loadBlueprintTemplateContext = async ({ accountsRootEmail, region }: BlueprintRenderInputs): Promise<BlueprintTemplateContext> => {
  const managementAccountId = await getAwsAccountId(region);
  const installerVersion = await getVersion(region);
  const organizationId = await getOrganizationId(region);
  const rootOuId = await getRootOuId(region);
  const identityStoreId = await getIdentityStoreId(region);

  return {
    managementAccountId,
    installerVersion,
    organizationId,
    rootOuId,
    identityStoreId,
    accountsRootEmail,
    region,
  };
};

const listBlueprintFiles = async (blueprintRoot: string): Promise<string[]> => {
  return (await fs.promises.readdir(blueprintRoot, {
    recursive: true,
  })).filter((filePath) => !filePath.includes('node_modules')
    && !filePath.includes('package-lock.json')
    && !filePath.includes('yarn.lock')
    && !filePath.includes('pnpm-lock.yaml'))
    .filter((filePath) => fs.lstatSync(path.join(blueprintRoot, filePath)).isFile());
};

const renderBlueprintFiles = async (
  blueprintName: string,
  templateContext: BlueprintTemplateContext,
): Promise<RenderedBlueprintFile[]> => {
  const projectRoot = resolveProjectPath();
  const blueprintRoot = buildBlueprintPath(blueprintName);
  const liquid = new Liquid({
    root: blueprintRoot,
    strictVariables: true,
    strictFilters: true,
    tagDelimiterLeft: '<<%',
    tagDelimiterRight: '%>>',
    outputDelimiterLeft: '<<',
    outputDelimiterRight: '>>',
  });
  const filePaths = await listBlueprintFiles(blueprintRoot);

  return filePaths.map((filePath) => {
    const output = liquid.renderFileSync(
      filePath,
      {
        AWS_ACCELERATOR_VERSION: templateContext.installerVersion,
        AWS_MANAGEMENT_ACCOUNT_ID: templateContext.managementAccountId,
        AWS_ORGANIZATION_ID: templateContext.organizationId,
        AWS_ROOT_OU_ID: templateContext.rootOuId,
        AWS_ACCOUNTS_ROOT_EMAIL: templateContext.accountsRootEmail,
        AWS_HOME_REGION: templateContext.region,
        AWS_IDENTITY_STORE_ID: templateContext.identityStoreId,
      },
    );

    return {
      relativePath: filePath,
      targetPath: path.join(projectRoot, filePath),
      content: output,
    };
  });
};

export class BlueprintRenderer {
  constructor(private readonly blueprintDirectory: string = DEFAULT_BLUEPRINT_DIRECTORY) {}

  async render(inputs: BlueprintRenderInputs): Promise<BlueprintRenderOutput> {
    const templateContext = await loadBlueprintTemplateContext(inputs);
    const files = await renderBlueprintFiles(this.blueprintDirectory, templateContext);
    return { templateContext, files };
  }
}
