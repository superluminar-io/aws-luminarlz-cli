import fs from 'fs';
import { mkdir } from 'node:fs/promises';
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
  return fs.existsSync(buildBlueprintPath(blueprintName));
};

interface BlueprintTemplateContext {
  managementAccountId: string;
  installerVersion: string;
  organizationId: string;
  rootOuId: string;
  identityStoreId: string;
  accountsRootEmail: string;
  region: string;
}

interface RenderedBlueprintFile {
  relativePath: string;
  targetPath: string;
  content: string;
}

export interface BlueprintRenderResult {
  managementAccountId: string;
  organizationId: string;
  rootOuId: string;
  accountsRootEmail: string;
  installerVersion: string;
  region: string;
}

export interface BlueprintFileDiff {
  relativePath: string;
  targetPath: string;
  currentContent: string;
  renderedContent: string;
}

export type ExistingFileDecision =
  | 'apply'
  | 'skip'
  | { updatedContent: string };

export interface UpdateBlueprintOptions {
  accountsRootEmail: string;
  region: string;
  dryRun?: boolean;
  onExistingFileDiff?: (fileDiff: BlueprintFileDiff) => Promise<ExistingFileDecision>;
}

export interface UpdateBlueprintResult extends BlueprintRenderResult {
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  unchangedCount: number;
}

interface UpdateCounters {
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  unchangedCount: number;
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

const loadBlueprintTemplateContext = async (accountsRootEmail: string, region: string): Promise<BlueprintTemplateContext> => {
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
    // fail on missing variables
    strictVariables: true,
    strictFilters: true,
    // use custom delimiters to avoid conflicts with other templating engines
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

const toRenderResult = (templateContext: BlueprintTemplateContext): BlueprintRenderResult => {
  return {
    managementAccountId: templateContext.managementAccountId,
    organizationId: templateContext.organizationId,
    rootOuId: templateContext.rootOuId,
    accountsRootEmail: templateContext.accountsRootEmail,
    installerVersion: templateContext.installerVersion,
    region: templateContext.region,
  };
};

const writeRenderedFile = async (targetPath: string, content: string) => {
  await mkdir(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content);
};

export const renderBlueprint = async (blueprintName: string, { forceOverwrite, accountsRootEmail, region }: {
  forceOverwrite: boolean;
  accountsRootEmail: string;
  region: string;
}) => {
  const templateContext = await loadBlueprintTemplateContext(accountsRootEmail, region);
  const renderedFiles = await renderBlueprintFiles(blueprintName, templateContext);

  for (const renderedFile of renderedFiles) {
    if (!forceOverwrite && fs.existsSync(renderedFile.targetPath)) {
      console.log(`Skipping ${renderedFile.targetPath} because it already exists.`);
      continue;
    }
    await writeRenderedFile(renderedFile.targetPath, renderedFile.content);
  }
  return toRenderResult(templateContext);
};

export const updateBlueprint = async (blueprintName: string, options: UpdateBlueprintOptions): Promise<UpdateBlueprintResult> => {
  const templateContext = await loadBlueprintTemplateContext(options.accountsRootEmail, options.region);
  const renderedFiles = await renderBlueprintFiles(blueprintName, templateContext);
  const dryRun = options.dryRun ?? false;

  const counters = initializeUpdateCounters();
  for (const renderedFile of renderedFiles) {
    await processRenderedFileUpdate(renderedFile, options, dryRun, counters);
  }

  return {
    ...toRenderResult(templateContext),
    ...counters,
  };
};

const initializeUpdateCounters = (): UpdateCounters => ({
  createdCount: 0,
  updatedCount: 0,
  skippedCount: 0,
  unchangedCount: 0,
});

const processRenderedFileUpdate = async (
  renderedFile: RenderedBlueprintFile,
  options: UpdateBlueprintOptions,
  dryRun: boolean,
  counters: UpdateCounters,
): Promise<void> => {
  if (!fs.existsSync(renderedFile.targetPath)) {
    counters.createdCount += 1;
    if (!dryRun) {
      await writeRenderedFile(renderedFile.targetPath, renderedFile.content);
    }
    return;
  }

  const currentContent = fs.readFileSync(renderedFile.targetPath, 'utf8');
  if (currentContent === renderedFile.content) {
    counters.unchangedCount += 1;
    return;
  }

  const decision = await resolveExistingFileDecision(renderedFile, currentContent, options.onExistingFileDiff);
  await applyExistingFileDecision(decision, renderedFile, currentContent, dryRun, counters);
};

const resolveExistingFileDecision = async (
  renderedFile: RenderedBlueprintFile,
  currentContent: string,
  onExistingFileDiff?: (fileDiff: BlueprintFileDiff) => Promise<ExistingFileDecision>,
): Promise<ExistingFileDecision> => {
  if (!onExistingFileDiff) {
    return 'skip';
  }
  return onExistingFileDiff({
    relativePath: renderedFile.relativePath,
    targetPath: renderedFile.targetPath,
    currentContent,
    renderedContent: renderedFile.content,
  });
};

const applyExistingFileDecision = async (
  decision: ExistingFileDecision,
  renderedFile: RenderedBlueprintFile,
  currentContent: string,
  dryRun: boolean,
  counters: UpdateCounters,
): Promise<void> => {
  if (decision === 'skip') {
    counters.skippedCount += 1;
    return;
  }

  if (decision === 'apply') {
    counters.updatedCount += 1;
    if (!dryRun) {
      await writeRenderedFile(renderedFile.targetPath, renderedFile.content);
    }
    return;
  }

  if (decision.updatedContent === currentContent) {
    counters.skippedCount += 1;
    return;
  }

  counters.updatedCount += 1;
  if (!dryRun) {
    await writeRenderedFile(renderedFile.targetPath, decision.updatedContent);
  }
};
