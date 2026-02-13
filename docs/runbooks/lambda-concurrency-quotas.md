# Lambda Concurrency Quota Requests Runbook

This runbook explains when and how to use `quotas lambda-concurrency request` safely.

## Purpose

The command requests Lambda account-level concurrency quota increases to at least `minLambdaConcurrency` from `config.ts`.

Use it to:

- reduce deploy failures caused by low regional Lambda concurrency,
- align enrolled accounts and enabled regions with the required minimum,
- submit only needed requests; accounts/regions with already open AWS quota requests are skipped automatically.

## When to run

- after initial Control Tower rollout, before or during the first LZA rollout,
- after changing `minLambdaConcurrency`,
- after enabling new regions,
- after enrolling new accounts,
- when `doctor` reports `lambda-concurrency` failures.

## Standard usage

Preview first (recommended):

```bash
npm run cli -- quotas lambda-concurrency request --dry-run
```

Submit requests:

```bash
npm run cli -- quotas lambda-concurrency request
```

## Expected output patterns

- `OK <account> <region>: <value>`
  account/region already meets or exceeds minimum.
- `Request <account> <region>: <current> -> <minimum>`
  shown in dry-run for accounts/regions that would be requested.
- `Requested <account> <region>: <current> -> <minimum>`
  request submitted successfully.
- `Skip <account>: role ... not available`
  member account is not yet ready for cross-account assume role.
- `Skip <account> <region>: quota request already pending`
  existing open request detected (`PENDING` or `CASE_OPENED`).
- `Failed <account> <region>: <message>`
  request call failed and needs operator follow-up.

## Safe operator workflow

1. Run `doctor` first and confirm `lambda-concurrency` is the blocker.
2. Run quota command with `--dry-run` and review scope.
3. Run quota command without `--dry-run`.
4. Track approvals in AWS Service Quotas.
5. Re-run `doctor` and then `deploy`.

## Notes

- The command checks all enabled regions and organization accounts discovered by the CLI.
- Member accounts are skipped when the configured assume-role cannot be assumed (default: `AWSControlTowerExecution`, override via `LZA_ASSUME_ROLE_NAME`).
- If AWS Support approval is required, request fulfillment can take time; until then, `doctor` can continue to fail on those targets.
