# Doctor Preflight Runbook

This runbook explains how `doctor` is used in the normal deploy flow and how to use it manually for troubleshooting.

## Purpose

`doctor` validates deploy prerequisites before config upload and pipeline execution.

Use it to:

- prevent avoidable deploy failures,
- identify account/region/version mismatches quickly,
- get actionable fix hints per failed check.

## Default behavior

`deploy` runs `doctor` automatically and aborts when checks fail.

Standard path:

```bash
npm run cli -- deploy
```

`--skip-doctor` should only be used intentionally, for example in controlled emergency situations.

## Current capabilities

`doctor` currently supports:

- Full preflight run across all checks.
- Targeted execution with `--only <comma-separated-check-ids>`.
- Offline fixture mode with `--fixtures <path-to-json>`.
- Machine-friendly exit codes:
  - `0` when all selected checks pass,
  - `1` when at least one selected check fails.

Current check IDs:

- `aws-identity`: verifies the current AWS caller account matches `managementAccountId` from config.
- `installer-version`: verifies installer version in SSM matches configured `awsAcceleratorVersion`.
- `installer-stack`: verifies the LZA installer CloudFormation stack exists in the management account.
- `config-bucket`: verifies the accelerator config S3 bucket exists and is reachable.
- `cdk-assets-buckets`: verifies CDK bootstrap asset buckets exist for all configured `enabledRegions`.
- `lambda-concurrency`: verifies regional account Lambda concurrency meets `minLambdaConcurrency` (across enrolled accounts/regions where applicable).
- `lza-checkout`: verifies local `.landing-zone-accelerator-on-aws-<release>` checkout exists and branch/version matches config.

## When to run doctor manually

Run `doctor` directly when you want diagnostics without starting deploy:

- after a deploy was aborted by doctor,
- after changing `config.ts`,
- after bootstrap/infrastructure updates (installer stack, buckets, regions, quotas),
- during CI/output troubleshooting with fixtures.

```bash
npm run cli -- doctor
```

## Focused troubleshooting

Run only selected checks to isolate a failing area:

```bash
npm run cli -- doctor --only aws-identity,config-bucket
```

Use only IDs from the supported list. Unknown IDs are currently ignored.

Useful check IDs:

- `aws-identity`
- `installer-version`
- `installer-stack`
- `config-bucket`
- `cdk-assets-buckets`
- `lambda-concurrency`
- `lza-checkout`

## Offline output reproduction

Use fixtures to reproduce output and failure handling without live AWS calls:

```bash
npm run cli -- doctor --fixtures fixtures/doctor-ok.json
npm run cli -- doctor --fixtures fixtures/doctor-fail-config-bucket.json
```

## Interpreting failures

- `aws-identity`: wrong AWS account context (not management account).
- `installer-version` / `installer-stack`: installer state is missing or out of sync with config.
- `config-bucket` / `cdk-assets-buckets`: bootstrap/deploy prerequisites are incomplete.
- `lambda-concurrency`: account-level quota below `minLambdaConcurrency`.
- `lza-checkout`: local LZA checkout missing or on wrong branch.

## Operator workflow

1. Run `npm run cli -- deploy`.
2. If deploy aborts on doctor checks, run `npm run cli -- doctor --only <failed-check-ids>` to isolate fixes.
3. Fix reported prerequisites.
4. Run `npm run cli -- deploy` again.

This keeps deploy behavior deterministic and avoids partial progress followed by predictable pipeline errors.
