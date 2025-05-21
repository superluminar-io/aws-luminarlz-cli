# AWS Landing Zone

## Overview

Contains the configuration for the [Landing Zone Accelerator on AWS (LZA)](https://awslabs.github.io/landing-zone-accelerator-on-aws/latest/).
It uses the [aws-luminarlz-cli](https://github.com/superluminar-io/aws-luminarlz-cli)
to manage and deploy the LZA config.

### Directory structure

* [templates](templates) contains the liquid templates and other files that are used to generate the LZA config.
* [customizations](customizations) contains a CDK app used to generate the Cloudformation templates that are defined in the [customizations-config](templates/customizations-config.yaml.liquid).
* [config.ts](config.ts) defines how the templates are generated and all project relevant configurations.
* [docs](docs) contains:
  * [Architecture Decision Records (ADRs)](docs/adrs) that document project-specific decisions.
  * [Runbooks](docs/runbooks) that help you with Landing Zone tasks.

### Customizations

Parts of the landing zone are [customizations](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/customizing-the-solution.html)
that are deployed via the LZA.

These are configured in the [customizations-config](templates/customizations-config.yaml.liquid) file.
LZA supports deploying Cloudformation templates
which in this project are generated via the [customizations](customizations/bin/customizations.ts) CDK app.

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

### Deploy a LZA customizations stack

This allows you to deploy a LZA customizations stack manually during development.
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

## Deployment

A deployment consists of synthesizing the LZA config and uploading it to s3.

Uploading the LZA config to s3 then triggers the [LZA Core pipeline](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/awsaccelerator-pipeline.html).

[//]: # (TODO: Add this if you are using a GitHub Action CD pipeline.)
[//]: # (Deployment of the LZA config happens automatically via a GitHub Actions CD pipeline on the main branch.)

If you want to deploy manually from your local machine, you can use the following command:

```bash
npm run cli -- deploy
```

## Update the Landing Zone Accelerator version

To update the LZA version,
you can follow [LZA the update guide](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/update-the-solution.html)
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