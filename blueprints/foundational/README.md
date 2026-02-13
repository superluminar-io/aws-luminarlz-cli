# AWS Landing Zone

## Overview

Contains the configuration for the [Landing Zone Accelerator on AWS (LZA)](https://awslabs.github.io/landing-zone-accelerator-on-aws/latest/).
It uses the [aws-luminarlz-cli](https://github.com/superluminar-io/aws-luminarlz-cli)
to manage and deploy the LZA config.

### Directory structure

* [templates](templates) contains the liquid templates and other files that are used to generate the LZA config.
* [customizations](customizations) contains a CDK app used to generate the CloudFormation templates that are defined in the [customizations-config](templates/customizations-config.yaml.liquid).
* [config.ts](config.ts) defines how the templates are generated and all project relevant configurations.
  * `cloudTrailLogGroupName` defaults to `__AUTO__`, which resolves the Control Tower CloudTrail log group during `deploy`.
* [docs](docs) contains:
  * [Architecture Decision Records (ADRs)](docs/adrs) that document project-specific decisions.
  * [Runbooks](docs/runbooks) that help you with Landing Zone tasks.

### Customizations

Parts of the landing zone are [Customizations](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/customizing-the-solution.html)
that are deployed via the LZA.

These are configured in the [customizations-config](templates/customizations-config.yaml.liquid) file.
LZA supports deploying CloudFormation templates
which in this project are generated via the [Customizations](customizations/bin/customizations.ts) CDK app.

## AWS access

Use the [SSO sign-in page](https://<<AWS_IDENTITY_STORE_ID>>.awsapps.com/start) to get access to the AWS accounts.

## Prerequisites

* Credentials with administrator privileges for the `Management` AWS account.
* Install the node version defined in [.node-version](.node-version).
* Install dependencies:
```bash
npm i
```

## Development

### Manual synth of the LZA config

```bash
npm run cli -- synth
```

### Validate the LZA config

This allows you to validate the LZA config before deploying it.
Underneath it uses the [LZA Core CLI](https://awslabs.github.io/landing-zone-accelerator-on-aws/latest/developer-guide/scripts/#core-cli).

```bash
npm run cli -- lza config validate
```

### Doctor (preflight checks)

Run a preflight check before deploys:
```bash
npm run cli -- doctor
```

`deploy` runs the doctor preflight automatically and aborts on failures. Use `--skip-doctor` to bypass the checks.
For operator workflow and troubleshooting order, see the [Doctor preflight runbook](docs/runbooks/doctor-preflight.md).

Checks performed:
- AWS account matches `managementAccountId` (prevents running in the wrong account)
- LZA installer version (SSM) matches `awsAcceleratorVersion` (avoids version drift)
- Installer stack exists (required for LZA pipelines)
- Config bucket exists (required for config uploads)
- CDK assets buckets exist for all `enabledRegions` (created by `lza core bootstrap`, required for customizations assets)
- Lambda account concurrency meets `minLambdaConcurrency` for all enabled regions (checks only the current account unless Control Tower enrollment exists for members)
- LZA checkout exists under `.landing-zone-accelerator-on-aws-<release>` and the checked-out branch matches `awsAcceleratorVersion` (ensures local checkout matches config)

Check IDs for `--only`:
- `aws-identity` – AWS account matches `managementAccountId`
- `installer-version` – LZA installer version matches `awsAcceleratorVersion`
- `installer-stack` – Installer stack exists
- `config-bucket` – Config bucket exists
- `cdk-assets-buckets` – CDK assets buckets exist for all `enabledRegions`
- `lambda-concurrency` – Lambda concurrent executions quota meets `minLambdaConcurrency`
- `lza-checkout` – LZA checkout branch matches `awsAcceleratorVersion`

Run only specific checks:
```bash
npm run cli -- doctor --only aws-identity,config-bucket
```

Offline testing with fixtures:
```bash
npm run cli -- doctor --fixtures fixtures/doctor-ok.json
npm run cli -- doctor --fixtures fixtures/doctor-missing-bucket.json
npm run cli -- doctor --fixtures fixtures/doctor-fail-account.json
npm run cli -- doctor --fixtures fixtures/doctor-fail-version.json
npm run cli -- doctor --fixtures fixtures/doctor-fail-installer-stack.json
npm run cli -- doctor --fixtures fixtures/doctor-fail-config-bucket.json
npm run cli -- doctor --fixtures fixtures/doctor-fail-cdk-assets.json
npm run cli -- doctor --fixtures fixtures/doctor-fail-lza-checkout.json
```

### Quota requests (Lambda concurrency)

Request Lambda concurrency quota increases for enrolled accounts and enabled regions:
```bash
npm run cli -- quotas lambda-concurrency request
```

Dry run (no requests submitted):
```bash
npm run cli -- quotas lambda-concurrency request --dry-run
```

Notes:
- Uses `minLambdaConcurrency` from `config.ts`.
- Skips member accounts where `AWSControlTowerExecution` does not exist yet.
- Operator workflow and troubleshooting order: [Lambda concurrency quota runbook](docs/runbooks/lambda-concurrency-quotas.md).

### Deploy a LZA Customizations stack

This allows you to deploy a LZA Customizations stack manually during development.
Underneath it uses the [LZA Core CLI](https://awslabs.github.io/landing-zone-accelerator-on-aws/latest/developer-guide/scripts/#core-cli).

```bash
# synth
npm run cli -- lza customizations-stack synth --stack-name <target-stack-name> --account-id <target-account-id>
# e.g.: npm run cli -- lza customizations-stack synth --stack-name LzaCustomization-AwsAcceleratorPipeline --account-id <<AWS_MANAGEMENT_ACCOUNT_ID>>

# synth & deploy
npm run cli -- lza customizations-stack deploy --stack-name <target-stack-name> --account-id <target-account-id>
```

### Deploy a LZA pipeline stage

This allows you to deploy a specific stage of the LZA pipeline for development or debugging purposes.
Underneath it uses the [LZA Core CLI](https://awslabs.github.io/landing-zone-accelerator-on-aws/latest/developer-guide/scripts/#core-cli).

```bash
# synth
npm run cli -- lza stage synth

# synth & deploy
npm run cli -- lza stage deploy # by default the customizations stage is deployed

# to deploy another stage have a look at the help
npm run cli -- lza stage deploy --help
```

### Deploying a new region

If you just add a new region and call `npm run cli -- deploy` it will fail
when trying to upload the CDK assets for the Customizations to the new region.
This is because it's expecting the new region already to be bootstrapped
which includes the s3 bucket for the CDK assets.

To deploy a new region:

1. Add the new region to the `ENABLED_REGIONS` in the [config.ts](config.ts) file.
2. Bootstrap the new region using the LZA:

```bash
npm run cli -- lza core bootstrap
```
Afterward you can commit your changes and trigger a deployment with `npm run cli -- deploy`.

## Deployment

A deployment consists of synthesizing the LZA config and uploading it to S3.

Uploading the LZA config to S3 then triggers the [LZA Core pipeline](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/awsaccelerator-pipeline.html).

[//]: # (TODO: Add this if you are using a GitHub Action CD pipeline.)
[//]: # (Deployment of the LZA config happens automatically via a GitHub Actions CD pipeline on the main branch.)

If you want to deploy manually from your local machine, you can use the following command:

```bash
npm run cli -- deploy
```

Note: `deploy` runs the doctor preflight automatically and aborts on failures. Use `--skip-doctor` to bypass the checks.

If the accelerator pipeline is already running, `deploy` uploads a pending config artifact (`zipped/aws-accelerator-config-pending.zip`) instead of replacing the active artifact.
The pending artifact is promoted after the current pipeline execution completes.
Safety fallback: if `/accelerator/pending-deploy-flow/enabled` is missing or `false`, `deploy` aborts when an execution is already in progress.
Decision rationale: [ADR 004](docs/adrs/004-pending-deploy-flow-for-in-progress-pipeline-runs.md).

## Update the Landing Zone Accelerator version

To update the LZA version,
you can follow [the LZA update guide](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/update-the-solution.html)
or use this CLI as follows:

1. Check that the locally configured version is in sync with the deployed version:
```bash
npm run cli -- lza installer-version check
```
2. Update the `awsAcceleratorVersion` of the config object in the [config.ts](config.ts) file with a newer version.
3. Make sure to check that [the personal GitHub access token used by the LZA is still valid](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/problem-github-personal-access-token-expired.html).
   Otherwise, update [the Secret in the Secret Manager](https://<<AWS_HOME_REGION>>.console.aws.amazon.com/secretsmanager/secret?name=accelerator%2Fgithub-token).
4. Trigger the version update:
```bash
npm run cli -- lza installer-version update
```
5. Wait and manually check that [both accelerator pipelines](https://console.aws.amazon.com/codesuite/codepipeline/pipelines?pipelines-meta=eyJmIjp7InRleHQiOiJBV1NBY2NlbGVyYXRvciJ9LCJzIjp7InByb3BlcnR5IjoidXBkYXRlZCIsImRpcmVjdGlvbiI6LTF9LCJuIjozMCwiaSI6MH0) succeeded with the new version.
