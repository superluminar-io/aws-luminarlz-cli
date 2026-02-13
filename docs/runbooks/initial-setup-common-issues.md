# Initial Setup Common Issues

This runbook documents common problems during the first Control Tower/LZA rollout and initial `aws-luminarlz-cli` usage.

## 1. `accelerator/github-token` secret missing or invalid

Symptoms:

- installer pipeline cannot access GitHub source,
- Source stage fails with repository access/token errors.

Typical causes:

- secret `accelerator/github-token` does not exist,
- secret value is not plain text,
- token scopes are insufficient.

Fix:

1. Create a GitHub Personal Access Token (Classic):
   - `public_repo` for public repositories,
   - `repo` for private repositories.
2. Store it in AWS Secrets Manager as plain text (no JSON) under `accelerator/github-token`.

Verify:

- rerun installer/core pipeline and confirm source fetch succeeds.

## 2. Secret update automation does not trigger during first rollout

Symptoms:

- token update lambda/event flow does not run during initial setup,
- updating the secret appears to have no automation effect.

Cause:

- before initial Control Tower/LZA completion, required CloudTrail/event wiring may not exist yet.
- the installer EventBridge rule listens for Secrets Manager API calls via CloudTrail and matches `requestParameters.secretId` in ARN form.

Fix:

1. For first rollout, set `accelerator/github-token` correctly before running installer/core flow.
2. Do not rely on event-driven secret update automation until initial environment deployment completed successfully.
3. If automation is already broken in the first rollout, a simple installer pipeline rerun may not fix it while Trail/Event wiring is still missing.
4. Recovery options:
   - recreate the installer stack (delete/redeploy) after prerequisites are in place, or
   - invoke the update-token lambda manually with an event payload that contains `detail.requestParameters.secretId` as secret ARN.
5. For later updates, prefer secret updates by ARN when EventBridge matching is ARN-based.

Verify:

- initial deployment completes,
- later secret updates trigger expected automation behavior.

## 3. Lambda concurrency too low for first deploy

Symptoms:

- `deploy` aborts in doctor preflight on `lambda-concurrency`,
- LZA stages fail with regional account concurrency constraints.

Fix:

1. Preview requests:
```bash
npm run cli -- quotas lambda-concurrency request --dry-run
```
2. Submit requests:
```bash
npm run cli -- quotas lambda-concurrency request
```
3. Wait for AWS approval.
4. Rerun:
```bash
npm run cli -- deploy
```

Verify:

- `lambda-concurrency` check passes,
- deploy progresses without concurrency quota failures.

## 4. Control Tower rollout times out at 45 minutes in new accounts

Symptoms:

- initial Control Tower build fails at exactly 45 minutes,
- repeated early-timeout behavior in newly created account.

Observed cause:

- account-level AWS-side limits/score constraints can affect timeout behavior in new accounts.

Fix:

1. Retry rollout once to confirm it is not a transient failure.
2. Open an AWS Support case and reference the repeated 45-minute timeout behavior in the new account.
3. Continue rollout after AWS-side limit handling is confirmed.

Verify:

- rerun completes without fixed 45-minute timeout failure.

## 5. Overlapping pipeline executions cause account lookup failures

Symptoms:

- later pipeline stages fail with messages such as:
  - `Account Name not found for undefined`
- failures appear when a second deploy is triggered while a previous execution is still running.

Cause:

- commit-filtered account lookup in config DynamoDB combined with shared keys per account email can produce missing rows for one execution during overlap.

Detailed analysis, evidence collection commands, and mitigation are documented here:

- `docs/runbooks/pipeline-overlap-commit-race.md`
