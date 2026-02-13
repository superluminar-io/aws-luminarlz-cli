# 4. Pending deploy flow for in-progress pipeline runs

## Context

- The accelerator pipeline can be triggered while a previous execution is still running.
- The deploy command uploads the config artifact to S3. Overwriting the active artifact key during an in-progress pipeline can cause stages to read mixed config snapshots.
- In practice, overlapping executions led to inconsistent behavior and failures (for example missing account mapping values).
- CodePipeline execution modes (`QUEUED`, `SUPERSEDED`) do not solve artifact-key overwrite races by themselves.
- Required behavior: keep "latest wins" semantics without executing every intermediate deploy request.

## Decision

Use a single-slot pending artifact flow with an explicit safety marker:

- `deploy` always runs doctor preflight first and aborts on failed checks unless `--skip-doctor` is explicitly used.
- If the accelerator pipeline is not `InProgress`, `deploy` uploads the active artifact key (`zipped/aws-accelerator-config.zip`) as before.
- If the pipeline is `InProgress`:
  - When `/accelerator/pending-deploy-flow/enabled` is `true`, `deploy` uploads `zipped/aws-accelerator-config-pending.zip`.
  - When the marker is missing or `false`, `deploy` aborts (safe fallback).
- The S3/EventBridge trigger is filtered to the active key only, so pending uploads do not start a pipeline execution.
- On pipeline completion (`SUCCEEDED`, `FAILED`, `STOPPED`, `CANCELED`, `SUPERSEDED`), an EventBridge rule triggers a promotion Lambda that:
  - copies `...-pending.zip` to the active key,
  - deletes `...-pending.zip`.
- The copy operation to the active key triggers exactly one follow-up pipeline execution with the newest pending config.
- If multiple deploy calls happen while one execution is running, the pending key is overwritten, so only the latest pending config is retained.

## Consequences

Positive:

- Prevents active-artifact races while pipeline stages are running.
- Preserves operator intent with latest-wins behavior for bursts of deploy calls.
- Avoids unnecessary queue buildup of obsolete intermediate deploy requests.
- Improves first-run resilience via marker-based safe fallback.

Trade-offs:

- Adds moving parts (marker parameter, completion rule, promotion Lambda, IAM/KMS permissions).
- Promotion Lambda must have permissions for encrypted config bucket objects (including `kms:GenerateDataKey` and related KMS actions) when SSE-KMS is enabled.
- Pending promotion depends on event-driven infrastructure health and should be monitored via EventBridge/Lambda logs.

## Alternatives considered

- Keep pure deploy guard (always abort when pipeline is running):
  - safest behavior, but no deferred deploy path and more manual retries.
- Rely on `QUEUED`:
  - does not prevent artifact overwrite races on a shared active S3 key.
- Rely on `SUPERSEDED`:
  - in the original state (before this change), observed behavior still allowed overlapping pipeline executions in practice, with the same inconsistency failures.
- Create unique artifact key per deploy and run fully parallel:
  - not compatible with current LZA pipeline/customization assumptions and would require deeper pipeline redesign.

## Rollback

### Temporarily disable pending flow

Use this when pending flow should be paused, but the automation should stay installed.

1. Set `/accelerator/pending-deploy-flow/enabled` to `false` (or delete the parameter).
2. Optional verification: run `deploy` while a pipeline execution is `InProgress`.
   - expected result: deploy aborts instead of uploading `...-pending.zip`.

### Fully decommission pending flow

Use this only when pending flow is no longer needed.

1. Temporarily disable it first (steps above).
2. Check for remaining pending artifact `zipped/aws-accelerator-config-pending.zip`.
   - if present and still relevant, promote it manually before removing automation.
3. Disable or remove the pipeline-completion EventBridge rule and promotion Lambda.
