# AWS luminarlz CLI

![NPM Version](https://img.shields.io/npm/v/%40superluminar-io%2Faws-luminarlz-cli)

A lean, opinionated CLI
to make deployment and development with the [Landing Zone Accelerator on AWS (LZA)](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws) easier.

## What it does and doesn't and what you need to know

 - It provides a blueprint to easily set up a [well-architected AWS landing zone](https://docs.aws.amazon.com/prescriptive-guidance/latest/migration-aws-environment/welcome.html).
 - It helps you with the deployment and maintenance of the [LZA](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws).
 - It does not add any new features to the LZA.
 - In case you want, it lets you [opt out](#remove-the-aws-luminarlz-cli) and remove the dependency to the AWS luminarlz CLI completely.
 - It uses [LiquidJS](https://liquidjs.com/) to generate the LZA config files.
 - It uses [AWS CDK](https://github.com/aws/aws-cdk) to generate the [AWS Cloudformation](https://docs.aws.amazon.com/cloudformation/) templates used for the [LZA customizations](https://awslabs.github.io/landing-zone-accelerator-on-aws/latest/faq/customizations/).
 - It doesn't replace but consumes the [LZA Core CLI](https://awslabs.github.io/landing-zone-accelerator-on-aws/latest/developer-guide/scripts/#core-cli) by automatically cloning [a local LZA checkout](https://github.com/awslabs/landing-zone-accelerator-on-aws) with the correct LZA version.
 - It allows you to easily use [LZA Core CLI](https://awslabs.github.io/landing-zone-accelerator-on-aws/latest/developer-guide/scripts/#core-cli) features like [LZA config validation](https://awslabs.github.io/landing-zone-accelerator-on-aws/latest/developer-guide/scripts/#configuration-validator), [LZA Core Pipeline stage synthesis or LZA Core Pipeline stage deployment](https://awslabs.github.io/landing-zone-accelerator-on-aws/latest/developer-guide/scripts/#core-cli).
 - It's not a free lunch and still requires you to know how various AWS libraries and services work together. Here are some readings to dive into:
   - [The LZA architecture overview](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/architecture-overview.html).
   - [LZA is recommended to be used together with AWS Control Tower](https://awslabs.github.io/landing-zone-accelerator-on-aws/latest/faq/ct-cfct/).
   - [LZA supports deploying custom Cloudformation Stacks, StackSets and more](https://awslabs.github.io/landing-zone-accelerator-on-aws/latest/faq/customizations/).
   - An LZA installation comes with the [Installer Pipeline](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/awsaccelerator-installer.html) & the [Core Pipeline](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/awsaccelerator-pipeline.html).

### Architecture diagram

![AWS luminarlz CLI Architecture diagram](docs/architecture-diagram.png)

## Usage

### Initialize a new AWS landing zone

This is a step-by-step guide to initialize a new AWS landing zone using the luminarlz CLI.

We'll use the [foundational blueprint](blueprints/foundational/) that is heavily aligned with the [Guidance for Establishing an Initial Foundation using Control Tower on AWS](https://aws.amazon.com/solutions/guidance/establishing-an-initial-foundation-using-control-tower-on-aws).

We recommend reading through the [Guidance](https://aws.amazon.com/solutions/guidance/establishing-an-initial-foundation-using-control-tower-on-aws) first
as there are parts that require some manual steps and upfront planning like the root email strategy.

Run initial setup in the configured `homeRegion` (installer stack, `accelerator/github-token`, and CLI deploy context).
Exception: `npm run cli -- lza core bootstrap` targets all configured `enabledRegions`.
For first-rollout troubleshooting, see the [Initial Setup Common Issues Runbook](docs/runbooks/initial-setup-common-issues.md).

1. Make sure you have an AWS Organizations management account which fulfils [the LZA prerequisites](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/prerequisites.html).
2. Create a GitHub Personal Access Token (Classic) for installer source access:
   - use `public_repo` for public repositories,
   - use `repo` for private repositories.
3. Store the token in AWS Secrets Manager as a plain text string (no JSON) with the name `accelerator/github-token`.
   If you update this secret later, prefer updates by secret ARN (not only by name) to match EventBridge patterns reliably.
4. Deploy the LZA installer stack using the official guidance:
   - [Step 1. Launch the stack](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/step-1.-launch-the-stack.html)
   - [Deploy the solution](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/deploy-the-solution.html)
   with:
   - **Environment Configuration**: `Control Tower Environment = Yes`
   - **Config Repository Configuration**: `Configuration Repository Location = s3`
5. Wait until the initial LZA deployment is successful:
   - [Step 2. Await initial environment deployment](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/step-2.-await-initial-environment-deployment.html)
6. Configure your terminal with AWS administrator credentials for the `Management` AWS account.
7. In your landing-zone project repository, initialize the project:
```bash
npx @superluminar-io/aws-luminarlz-cli init
```
8. Install the new dependencies:
```bash
yarn install
```
9. Adapt the settings and fill in the open `TODO`s in the generated `config.ts` file.
10. Have a look at the generated [README](blueprints/foundational/README.md) file
   as it contains further documentation on how to use the AWS luminarlz CLI.
11. Bootstrap the enabled regions before the first deploy (this creates required CDK assets buckets):
```bash
npm run cli -- lza core bootstrap
```
12. Deploy your new LZA config:
```bash
npm run cli -- deploy
```
Note: `deploy` runs the doctor preflight automatically and aborts on failures. Use `--skip-doctor` to bypass the checks.
If the accelerator pipeline is already running, `deploy` uploads a pending config artifact (`zipped/aws-accelerator-config-pending.zip`) instead of replacing the active artifact.
The pending artifact is promoted after the current pipeline execution completes.
Safety fallback: if the pending flow marker parameter (`/accelerator/pending-deploy-flow/enabled`) is missing or `false`, `deploy` aborts when an execution is already in progress.
13. If deploy fails with Lambda concurrency preflight issues, request quota increases and wait for approval:
```bash
npm run cli -- quotas lambda-concurrency request --dry-run
npm run cli -- quotas lambda-concurrency request
```
After approval, rerun:
```bash
npm run cli -- deploy
```
14. Search for open `TODO` comments in the generated files and adapt them to your needs.

### Other CLI commands

Documentation for the other CLI commands can be found in the README generated when intializing a new AWS landing zone.
Have a look at the [foundational blueprint README](blueprints/foundational/README.md).
The quota request command for Lambda concurrency is documented there as well.
Operator workflow guidance is in the [Lambda concurrency quota runbook](docs/runbooks/lambda-concurrency-quotas.md).

#### Doctor (preflight checks)

Run a preflight check before deploys:
```bash
npm run cli -- doctor
```

`deploy` runs the doctor preflight automatically and aborts on failures. Use `--skip-doctor` to bypass the checks.

Full details (check list, IDs, and fixture usage) are in the [foundational blueprint README](blueprints/foundational/README.md#doctor-preflight-checks).
Operator workflow guidance is in the [Doctor preflight runbook](docs/runbooks/doctor-preflight.md).

#### LZA Core CLI

Some of the CLI commands are using the [LZA Core CLI](https://awslabs.github.io/landing-zone-accelerator-on-aws/latest/developer-guide/scripts/#core-cli) underneath.

Running the LZA core CLI currently requires a local checkout of the LZA repository and building the project which will take a moment.

This will be done automatically for you once and every time you update the LZA version.

You should add `/.landing-zone-accelerator-on-aws-*` to your `.gitignore` file so that these local LZA checkouts are not committed to your repository.

## Development

### Prerequisites

- Install the node version defined in [.node-version](.node-version).
- Install dependencies:
```bash
yarn projen
```
- To run the CLI without building it:
```bash
./src/index.ts
```

## Remove the AWS luminarlz CLI

For whatever reason you want to remove the dependency to the AWS luminarlz CLI you can do so.
After calling:
```bash
npm run cli -- synth
```
You find the raw aws-accelerator-config in the `aws-accelerator-config.out` directory
and [deploy it](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/step-3.-update-the-configuration-files.html#using-s3)
with any other mechanism you like.
