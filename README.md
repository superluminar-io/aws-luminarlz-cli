# AWS luminarlz CLI
A lean, opinionated CLI
to make deployment and development with the [AWS Landing Zone Accelerator (LZA)](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws) easier.

Helps you to easily set up and manage a [well-architected AWS landing zone](https://docs.aws.amazon.com/prescriptive-guidance/latest/migration-aws-environment/welcome.html). 

It uses Liquidjs and CDK to generate the LZA config.

In case you want,
it lets you [opt out](#remove-the-aws-luminarlz-cli) and remove the dependency to the AWS luminarlz CLI completely.

## Usage

### Initialize a new AWS landing zone

This is a step-by-step guide to initialize a new AWS landing zone using the luminarlz CLI.

We'll use the `foundational` blueprint that is heavily aligned with the [Guidance for Establishing an Initial Foundation using Control Tower on AWS](https://aws.amazon.com/solutions/guidance/establishing-an-initial-foundation-using-control-tower-on-aws).

We recommend reading through the [Guidance](https://aws.amazon.com/solutions/guidance/establishing-an-initial-foundation-using-control-tower-on-aws) first
as there are parts that require some manual steps and upfront planning like the root email strategy.

1. Make sure you have an AWS Organizations management account which fulfils [the LZA prerequisites](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/prerequisites.html).
2. Make sure to [deploy the LZA](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/deploy-the-solution.html) with the following settings:
   - **Environment Configuration**: Leave all the defaults, `Control Tower Environment` needs to be set to `Yes`.
   - **Config Repository Configuration**: Leave all the defaults and set `Configuration Repository Location` to `s3`.
3. Wait until the initial LZA is [successfully deployed](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/step-2.-await-initial-environment-deployment.html).
4. Configure your terminal with AWS administrator credentials for the `Management` AWS account.
5. Init the project using:
```bash
npx @superluminar-io/aws-luminarlz-cli init
```
6. Install the new dependencies:
```bash
npm install
```
7. Adapt the settings in the generated `config.ts` file to your projects needs.
8. Deploy your new LZA config using:
```bash
# You'll need the `Management` account credentials with administrator rights to be configured in your terminal.
npm run cli -- deploy
```
9. Have a look at the generated [README](blueprints/foundational/README.md) file
   as it contains further documentation on how to use the AWS luminarlz CLI.
10. Search for open `TODO` comments in the generated files and adapt them to your needs.

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