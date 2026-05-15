# Architecture Reference — aws-luminarlz-cli

**Date:** 2026-05-15
**Status:** Reference (reflects current codebase as of this date)

---

## 1. Overview

`aws-luminarlz-cli` is a TypeScript CLI published as `@superluminar-io/aws-luminarlz-cli` on npm. It wraps the [Landing Zone Accelerator on AWS (LZA)](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws) to make initial setup, configuration synthesis, and ongoing deployment easier.

**What it does:**
- Initializes a new LZA project from a blueprint (templated YAML configs + CDK customizations)
- Synthesizes LZA YAML configuration from LiquidJS templates
- Publishes synthesized config to S3 to trigger the LZA Core Pipeline
- Synthesizes and deploys CDK customization stacks into member accounts
- Wraps the LZA Core CLI for validation, stage synth/deploy, and bootstrapping
- Manages LZA installer version checks and updates

**What it does not do:**
- Add new LZA features — it only drives the LZA, not replaces it
- Replace manual AWS Control Tower setup steps
- Manage the LZA Installer Pipeline itself (only the Installer Stack version)

**Key external dependencies:**

| Dependency | Role |
|-----------|------|
| [LZA](https://github.com/awslabs/landing-zone-accelerator-on-aws) | The underlying AWS landing zone engine; cloned locally and invoked via its Core CLI |
| AWS Control Tower | Required for LZA deployment; the CLI checks CT is active before init |
| AWS CDK | Used for customization stacks that extend the LZA baseline |
| [LiquidJS](https://liquidjs.com/) | Template engine for generating LZA YAML config files |
| [Clipanion](https://mael.dev/clipanion/) | CLI argument parsing and command routing |

---

## 2. Layer 1 — Entry Point

```
bin/aws-luminarlz-cli   →   src/index.ts   →   lib/index.js (compiled)
```

**`bin/aws-luminarlz-cli`** is a Node.js shebang script that simply `require`s the compiled `lib/index.js`. It is registered in `package.json` under `bin`, so `npx @superluminar-io/aws-luminarlz-cli` resolves to it.

**`src/index.ts`** is the CLI root:
1. Creates a Clipanion `Cli` instance labeled "AWS Luminarlz CLI"
2. Registers 11 command classes and the built-in `HelpCommand`
3. Calls `cli.runExit(process.argv.slice(2), { stdin, stdout, stderr })`

Command registration order:
`LzaCustomizationsStackDeploy`, `LzaCustomizationsStackSynth`, `LzaConfigValidate`, `LzaCoreBootstrap`, `LzaInstallerVersionCheck`, `LzaInstallerVersionUpdate`, `LzaStageDeploy`, `LzaStageSynth`, `Synth`, `Deploy`, `Init`

---

## 3. Layer 2 — CLI Commands (`src/commands/`)

### Command Hierarchy

```
init
synth
deploy
lza
├── config validate
├── core bootstrap
├── installer-version check
├── installer-version update
├── stage synth          (--stage, default: customizations)
├── stage deploy         (--stage, default: customizations)
├── customizations-stack synth   (--stack-name, --account-id, --region)
└── customizations-stack deploy  (--stack-name, --account-id, --region)
```

### Base Classes

**`LzaStage`** (`lza-stage.ts`) — abstract base for `lza stage *` commands
- Sets Clipanion namespace path to `['lza', 'stage']`
- Provides `--stage` option (string, defaults to `'customizations'`)
- Exposes `stageOrDefault` getter

**`LzaCustomizationsStack`** (`lza-customizations-stack.ts`) — abstract base for `lza customizations-stack *` commands
- Sets Clipanion namespace path to `['lza', 'customizations-stack']`
- Provides `--stack-name` (required) and `--account-id` (required) options
- Provides optional `--region`; exposes `regionOrHomeRegion` which falls back to `config.homeRegion`

### Command Responsibilities

| File | Command path | Core call |
|------|-------------|-----------|
| `init.ts` | `init` | `renderBlueprint()` |
| `synth.ts` | `synth` | `customizationsCdkSynth()` + `synthConfigOut()` |
| `deploy.ts` | `deploy` | synth + `customizationsPublishCdkAssets()` + `publishConfigOut()` |
| `lza-config-validate.ts` | `lza config validate` | `validate()` |
| `lza-core-bootstrap.ts` | `lza core bootstrap` | `bootstrapStage()` |
| `lza-installer-version-check.ts` | `lza installer-version check` | `checkVersion()` |
| `lza-installer-version-update.ts` | `lza installer-version update` | `updateVersion()` |
| `lza-stage-synth.ts` | `lza stage synth` | `synthStages()` |
| `lza-stage-deploy.ts` | `lza stage deploy` | `deployStage()` |
| `lza-customizations-stack-synth.ts` | `lza customizations-stack synth` | `customizationsCdkSynth(stackName)` |
| `lza-customizations-stack-deploy.ts` | `lza customizations-stack deploy` | `customizationsDeployStack()` |

Each command class:
- Extends Clipanion's `Command`
- Declares `static paths` (routing) and `static usage` (help text)
- Implements `async execute()` which calls into Layer 3

---

## 4. Layer 3 — Core Logic (`src/core/`)

Four sub-domains, each isolated under its own directory.

### 4.1 Blueprint (`core/blueprint/`)

Responsible for project initialization: fetching AWS environment context and rendering blueprint templates into a new project.

**`init-prechecks.ts`**
- `isLzaRolloutComplete()`: reads SSM parameter `/accelerator/AWSAccelerator-FinalizeStack-{accountId}-us-east-1/version` to confirm the initial LZA/Control Tower deployment is complete. Aborts init if not.

**`blueprint.ts`** — `renderBlueprint(options)`
1. Calls `isLzaRolloutComplete()` as a pre-check
2. Fetches AWS environment metadata via STS (`GetCallerIdentity`), Organizations (`DescribeOrganization`, `ListRoots`), CloudTrail (`GetTrail`), SSO Admin (`ListInstances`)
3. Creates a LiquidJS `Liquid` engine with custom delimiters `<<%` / `%>>` and `<<` / `>>` to avoid conflicts with LZA's default `{{ }}` syntax
4. Walks the blueprint directory recursively:
   - Directories: recreated in the output project
   - `.liquid` files: rendered with environment variables, written without the `.liquid` extension
   - Other files: copied as-is
5. Skips existing files unless `forceOverwrite: true`

Template variables injected during blueprint rendering:

| Variable | Source |
|----------|--------|
| `AWS_ACCELERATOR_VERSION` | Blueprint default |
| `AWS_MANAGEMENT_ACCOUNT_ID` | STS `GetCallerIdentity` |
| `AWS_ORGANIZATION_ID` | Organizations `DescribeOrganization` |
| `AWS_ROOT_OU_ID` | Organizations `ListRoots` |
| `AWS_ACCOUNTS_ROOT_EMAIL` | CLI option / interactive prompt |
| `AWS_HOME_REGION` | CLI option / interactive prompt |
| `AWS_CLOUDTRAIL_LOG_GROUP_NAME` | CloudTrail + CloudWatch log group ARN parsing |

### 4.2 Accelerator Config (`core/accelerator/config/`)

Responsible for synthesizing LZA YAML config from templates and publishing it to S3.

**`synth.ts`** — `synthConfigOut()`
- Reads all files from the project's `templates/` directory
- For `.liquid` files listed in `config.templates`: renders via LiquidJS with `<%` / `%>` delimiters (different from blueprint delimiters) and writes to `aws-accelerator-config.out/`
- For CDK-generated JSON templates referenced in config: copies from `customizations/cdk.out/` into `aws-accelerator-config.out/`
- Non-liquid files are copied directly

**`publish.ts`** — `publishConfigOut()`
- Zips `aws-accelerator-config.out/` using `zip-lib`
- Uploads the zip to the LZA config S3 bucket (`aws-accelerator-config-{managementAccountId}-{homeRegion}`) under key `zipped/aws-accelerator-config.zip`
- The S3 upload automatically triggers the LZA Core Pipeline (configured via S3 event notification on the LZA side)

**`cloudtrail.ts`** — `resolveControlTowerCloudTrailLogGroupName()`
- Used during blueprint init to find the Control Tower organization-level CloudTrail log group
- Calls CloudTrail `GetTrail`, parses the CloudWatch Logs ARN from the response

### 4.3 LZA Repository (`core/accelerator/repository/`)

Manages a local clone of the LZA source repository and wraps its Core CLI.

**`checkout.ts`**
- `getCheckoutPath()`: returns `.landing-zone-accelerator-on-aws-{branch}` relative to cwd
- `ensureCheckoutExists()`: if the checkout directory doesn't exist, shallow-clones (`--depth=1`) the LZA repo at the branch matching the configured version, then runs `yarn && yarn build` inside `source/`. Subsequent calls are no-ops (directory already present).
- `readCustomizationsStackTemplateBody()`: reads a synthesized CloudFormation JSON template from the LZA's own `cdk.out/`

**`core_cli.ts`**
Wraps LZA's own CLI tools, all invoked via `executeCommand()`:

| Function | LZA command |
|----------|------------|
| `validate()` | `yarn validate-config` from LZA accelerator package |
| `synthStages(stage, account, region)` | `ts-node --transpile-only cdk.ts synth` with `--stage`, `--account`, `--region` flags |
| `deployStage(stage, account, region)` | `ts-node --transpile-only cdk.ts deploy` with flags |
| `bootstrapStage()` | CDK bootstrap targeting the LZA bootstrap stage |

All LZA CLI invocations run from within `source/packages/@aws-accelerator/accelerator`.

### 4.4 Customizations CDK (`core/customizations/`)

Manages CDK synthesis, asset publishing, and CloudFormation deployment for the project's own customization stacks.

**`synth.ts`** — `customizationsCdkSynth(stackName?)`
- Runs `npx cdk synth [stackName]` from the `customizations/` directory
- Outputs CloudFormation JSON to `customizations/cdk.out/`

**`assets.ts`** — `customizationsPublishCdkAssets()`
- Finds all `*.assets.json` files in `customizations/cdk.out/`
- For each file, creates a CDK `AssetManifest` and publishes assets (S3 files, Docker images) to all target regions
- Uses `RegionAwareAwsClient`: a custom CDK asset client subclass that overrides region resolution — necessary because CDK asset publishing needs per-region credentials
- Publishes in parallel, chunked at max 200 concurrent uploads
- Uses `ConsoleProgress` (a custom `IPublishProgressListener`) to stream upload events to stdout

**`deploy.ts`** — `customizationsDeployStack(stackName, accountId, region)`
- Checks if the CloudFormation stack already exists via `DescribeStacks`
- Creates or updates the stack using the template body from `readCustomizationsStackTemplateBody()`
- For member accounts: assumes `arn:aws:iam::{accountId}:role/AWSControlTowerExecution` for cross-account access
- Uses `arn:aws:iam::{accountId}:role/cdk-accel-cfn-exec-role-{accountId}-{region}` as the CloudFormation execution role
- Waits for create/update completion (300-second timeout via CloudFormation waiters)

---

## 5. Layer 4 — Configuration System (`src/config.ts`)

### Dynamic Config Loading

The project root contains a user-authored `config.ts` file (TypeScript). At runtime the CLI:
1. Transpiles `config.ts` using the TypeScript compiler (reads `tsconfig.json` for settings)
2. Writes the output to `config.js`
3. `require()`s `config.js` and reads the default export
4. Caches the result — `loadConfigSync()` only transpiles once per process

This allows users to write typed TypeScript while keeping the CLI dependency-free from the user's build toolchain at runtime.

### Path Constants

| Constant | Value |
|----------|-------|
| `AWS_ACCELERATOR_CONFIG_OUT_PATH` | `aws-accelerator-config.out` |
| `AWS_ACCELERATOR_CONFIG_TEMPLATES` | `templates` |
| `CUSTOMIZATION_PATH` | `customizations` |
| `CDK_OUT_PATH` | `customizations/cdk.out` |
| `GLOBAL_REGION` | `us-east-1` |

### Resource Naming Patterns

| Resource | Pattern |
|----------|---------|
| LZA config S3 bucket | `aws-accelerator-config-{managementAccountId}-{homeRegion}` |
| CDK assets S3 bucket prefix | `cdk-accel-assets-{managementAccountId}-` |
| Config zip S3 key | `zipped/aws-accelerator-config.zip` |
| LZA Pipeline name | `AWSAccelerator-Pipeline` |
| LZA Installer Stack name | `AWSAccelerator-InstallerStack` |

### Config Interfaces

**`BaseConfig`** — shared base fields (name, homeRegion, managementAccountId, etc.)

**`Config`** extends `BaseConfig` with:
- `version`: LZA version string (maps to git branch)
- `regions`: list of enabled AWS regions
- `accounts`: typed account definitions (LogArchive, Audit, etc.)
- `templates`: array of `Template` objects (`{ fileName, parameters }`) — maps template filenames to their LiquidJS render parameters

---

## 6. Layer 5 — AWS Integration

### Services Used

| AWS Service | Where used | Purpose |
|------------|-----------|---------|
| STS | `blueprint.ts`, `config.ts` | Resolve management account ID |
| Organizations | `blueprint.ts` | Resolve organization ID and root OU ID |
| SSM | `installer.ts`, `init-prechecks.ts` | Read/write LZA version parameters |
| CloudTrail | `cloudtrail.ts` | Find Control Tower org CloudTrail log group |
| CloudFormation | `installer.ts`, `deploy.ts` | Create/update stacks, describe stacks |
| S3 | `publish.ts`, `assets.ts` | Upload config zip, publish CDK assets |
| SSO Admin | `blueprint.ts` | List SSO instances for blueprint init |
| CloudWatch Logs | (via CloudTrail ARN parsing) | Resolve log group name |

All AWS SDK v3 clients are used (`@aws-sdk/client-*`).

### Cross-Account Access

For deploying customization stacks into member accounts, the CLI assumes two IAM roles:

1. **`AWSControlTowerExecution`** in the target account — provides credentials for the deployment caller
2. **`cdk-accel-cfn-exec-role-{accountId}-{region}`** in the target account — passed to CloudFormation as the execution role

Credentials are obtained using `@aws-sdk/credential-providers`'s `fromTemporaryCredentials()`, chained from the management account session.

### Region Handling

- Most operations run in `homeRegion` (from config)
- Global AWS services (IAM, Organizations, STS, SSO) always use `us-east-1` (`GLOBAL_REGION`)
- CDK asset publishing is multi-region: `RegionAwareAwsClient` overrides the default region per asset manifest target

---

## 7. Blueprints (`blueprints/foundational/`)

A blueprint is the scaffolding the `init` command copies into the user's project. The only shipped blueprint is `foundational`, aligned with [AWS Guidance for Establishing an Initial Foundation using Control Tower](https://aws.amazon.com/solutions/guidance/establishing-an-initial-foundation-using-control-tower-on-aws).

### Blueprint Structure

```
blueprints/foundational/
├── config.ts              # Blueprint config (rendered during init)
├── package.json           # User project dependencies
├── tsconfig.json          # TypeScript config for user project
├── README.md              # Usage guide for the generated project
├── templates/             # LZA YAML config templates (.liquid files)
│   ├── accounts-config.yaml.liquid
│   ├── customizations-config.yaml.liquid
│   ├── global-config.yaml.liquid
│   ├── iam-config.yaml.liquid
│   ├── network-config.yaml.liquid
│   ├── organization-config.yaml.liquid
│   ├── security-config.yaml.liquid
│   └── tagging-policies/
│       └── default-tag-policy.json
└── customizations/        # CDK app for LZA customization stacks
    ├── bin/customizations.ts
    ├── cdk.json
    └── lib/
        ├── alternate-contacts-stack.ts
        ├── organizations-service-access-stack.ts
        ├── cost-categories-stack.ts
        ├── security-hub-*.ts
        ├── aws-accelerator-pipeline-stack.ts
        └── constructs/    # Reusable CDK constructs (custom resources)
```

### How a Blueprint Becomes a User Project

1. `init` command calls `renderBlueprint()` with the blueprint directory as source
2. LiquidJS renders all `.liquid` files (using `<<` / `>>` delimiters) with AWS environment variables
3. Non-liquid files are copied as-is
4. The user's project is the rendered output — from this point they edit the generated files directly

### LZA Config Templates

Templates use `<%` / `%>` delimiters for runtime rendering (during `synth`) and receive parameters defined in the user's `config.ts` `templates` array. This two-phase approach means:
- **Init time**: blueprint templates render with environment variables → user project files
- **Synth time**: user project templates render with config parameters → LZA YAML config output

---

## 8. Testing

### Framework

Jest with `ts-jest` for TypeScript support. Test timeout: 120 seconds (accommodates shell command invocations in integration-style tests).

### Test Helpers (`test/test-helper/`)

**`cli.ts`**
- `createCliFor(commands)`: creates a Clipanion `Cli` instance with only the specified commands — isolates tests from unrelated commands
- `runCli(cli, argv, cwd)`: executes the CLI, captures stdout/stderr, changes process cwd for the duration of the call
- `CliError`: thrown when exit code is non-zero, includes captured output for assertions

**`use-temp-dir.ts`**
- `useTempDir()`: creates a temporary directory and returns its path plus a `restore()` function
- `restore()`: changes cwd back to the original directory and deletes the temp directory
- Used in `beforeEach`/`afterEach` to give each test an isolated filesystem

**`install-local-luminarlz-cli.ts`**
- Installs the CLI package locally into a temp directory for integration tests that test the full binary

### Custom Matchers (`test/matchers/`)

**`toHaveCreatedCdkTemplates(stackNames)`**
Asserts that CDK synthesis produced JSON template files in `cdk.out/` for the given stack names.

**`toHaveBeenCalledInOrderWith(calls)`**
Asserts that a Jest mock was called multiple times in a specific sequence with specific arguments — used to verify command orchestration order.

### Mocking Strategy

- **AWS SDK**: `aws-sdk-client-mock` mocks SDK v3 clients at the send-command level — no real AWS calls in unit tests
- **Child processes**: `jest.spyOn(childProcess, 'exec')` intercepts shell commands (`executeCommand`)
- **File system**: temp directories give real isolated filesystems — no `memfs` or similar
- **Config loading**: tests write a minimal `config.ts` into the temp dir; `loadConfigSync()` picks it up

### Test Coverage

| Test file | What it covers |
|-----------|---------------|
| `init.test.ts` | Blueprint rendering, SSM pre-checks, file output |
| `synth.test.ts` | CDK synth + LiquidJS template rendering |
| `deploy.test.ts` | S3 upload, CDK asset publishing, pipeline trigger |
| `lza-config-validate.test.ts` | LZA Core CLI validation wrapper |
| `lza-core-bootstrap.test.ts` | Bootstrap stage invocation |
| `lza-installer-version-check.test.ts` | SSM version read + comparison |
| `lza-installer-version-update.test.ts` | CloudFormation stack update |
| `core-cloudtrail-config.test.ts` | CloudTrail log group resolution |

---

## 9. Build & Distribution

### Build System

The project is managed by [Projen](https://github.com/projen/projen). Projen generates and owns:
- `package.json` (scripts, dependencies, Jest config)
- `tsconfig.json`
- `.eslintrc.json`
- Parts of `README.md`

Project configuration lives in `.projenrc.ts`. To change build configuration, edit `.projenrc.ts` and run `npx projen`.

### Compilation

```
src/**/*.ts  →  (tsc)  →  lib/**/*.js + lib/**/*.d.ts
```

- Source: `src/`
- Output: `lib/` (compiled JS + type declarations)
- `bin/aws-luminarlz-cli` requires `lib/index.js` at runtime

### Distribution

Published to npm as `@superluminar-io/aws-luminarlz-cli`. Users invoke via `npx` or install globally. The `bin` field in `package.json` registers the binary.

### Key Runtime Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `clipanion` | `^3.2.1` | CLI framework |
| `liquidjs` | `^10.25.5` | Template rendering |
| `@aws-sdk/client-*` | v3 | AWS service clients |
| `@aws-cdk/cdk-assets-lib` | `^1.4.2` | CDK asset publishing |
| `zip-lib` | `^1.3.2` | Config archive creation |

### Key Dev Dependencies

| Package | Purpose |
|---------|---------|
| `typescript` | Compilation |
| `jest` + `ts-jest` | Test runner |
| `aws-sdk-client-mock` | AWS SDK mocking |
| `projen` | Build management |
| `constructs` | CDK constructs (for blueprint compilation) |
