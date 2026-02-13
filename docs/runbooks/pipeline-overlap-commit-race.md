# Pipeline Overlap Commit Race Runbook

This runbook documents the failure mode where overlapping LZA pipeline executions lead to missing account mappings for one execution.

Related upstream issue:

- https://github.com/awslabs/landing-zone-accelerator-on-aws/issues/1029

## Problem statement

A later stage (for example `identity-center`) fails with:

- `Account Name not found for undefined`

The failure appears during overlapping pipeline executions when one execution reads config-table data filtered by `CONFIG_COMMIT_ID` after another execution has already updated shared rows.

## Why this happens

Current lookup and storage behavior in LZA combines:

1. Commit-filtered lookup for account mappings in the config DynamoDB table.
2. Non-commit-isolated row keys for account mappings (`dataType + acceleratorKey(email)`).

Effect:

1. Execution A runs with commit `A`.
2. Execution B starts before A completes and writes newer commit `B` on the same Dynamo keys.
3. Execution A later queries rows with commit filter `A`.
4. Query can return zero rows for mandatory/workload account mappings.
5. Account lookup fails and throws `Account Name not found for undefined`.

## Code-level reference points

- Throw site:
  - `source/packages/@aws-accelerator/config/lib/accounts-config.ts` (`getAccountId`, `getAccountNameById`)
- Commit-filtered lookup:
  - `source/packages/@aws-accelerator/config/lib/accounts-config.ts` (query with `process.env['CONFIG_COMMIT_ID']`)
  - `source/packages/@aws-accelerator/utils/lib/query-config-table.ts` (`FilterExpression contains(commitId, :commitId)`)
- Shared key write path:
  - `source/packages/@aws-accelerator/accelerator/lib/lambdas/load-config-table/index.ts`
  - row key uses `dataType + acceleratorKey(email)`
- Stage behavior using Dynamo lookup:
  - `source/packages/@aws-accelerator/accelerator/lib/accelerator.ts`
  - `shouldLookupDynamoDb(stage)` enables lookup for deploy stages such as `identity-center`.

## Forensic verification procedure

Use this sequence to validate the race condition for a failed execution.

### 1. Resolve config table name

```bash
REGION=eu-central-1
TABLE=$(aws ssm get-parameter \
  --name /accelerator/prepare-stack/configTable/name \
  --region "$REGION" \
  --query 'Parameter.Value' \
  --output text)

echo "$TABLE"
```

### 2. Identify the failed CodeBuild execution

From CodePipeline execution details or CodeBuild UI, collect:

- `BUILD_ID` (example: `AWSAccelerator-ToolkitProject:7a23b096-fc50-44b1-9ed6-0bed843497c7`)
- `CONFIG_COMMIT_ID` used by that build

Retrieve `CONFIG_COMMIT_ID` from build environment:

```bash
BUILD_ID="<toolkit-build-id>"
COMMIT_ID=$(aws codebuild batch-get-builds \
  --ids "$BUILD_ID" \
  --region "$REGION" \
  --query "builds[0].environment.environmentVariables[?name=='CONFIG_COMMIT_ID'].value | [0]" \
  --output text)

echo "$COMMIT_ID"
```

### 3. Query account mapping rows for that commit

```bash
aws dynamodb query \
  --table-name "$TABLE" \
  --region "$REGION" \
  --key-condition-expression "dataType = :dt" \
  --filter-expression "contains(commitId, :cid)" \
  --expression-attribute-values '{":dt":{"S":"mandatoryAccount"},":cid":{"S":"'"$COMMIT_ID"'"}}' \
  --projection-expression "acceleratorKey,awsKey,commitId" \
  --output json | jq '.Items | length'

aws dynamodb query \
  --table-name "$TABLE" \
  --region "$REGION" \
  --key-condition-expression "dataType = :dt" \
  --filter-expression "contains(commitId, :cid)" \
  --expression-attribute-values '{":dt":{"S":"workloadAccount"},":cid":{"S":"'"$COMMIT_ID"'"}}' \
  --projection-expression "acceleratorKey,awsKey,commitId" \
  --output json | jq '.Items | length'
```

Interpretation:

- `0 / 0` for failed commit strongly indicates missing commit-scoped mappings at read time.

### 4. Verify the same key exists with a different commit

```bash
EMAIL="<email-from-accounts-config-lowercase>"

aws dynamodb get-item \
  --table-name "$TABLE" \
  --region "$REGION" \
  --consistent-read \
  --key '{"dataType":{"S":"mandatoryAccount"},"acceleratorKey":{"S":"'"$EMAIL"'"}}' \
  --projection-expression "acceleratorKey,awsKey,commitId" \
  --output json | jq '.Item'
```

Interpretation:

- If row exists but `commitId != COMMIT_ID` of the failed build, the row was updated by another execution.

### 5. Optional: verify row cardinality per key

```bash
aws dynamodb query \
  --table-name "$TABLE" \
  --region "$REGION" \
  --key-condition-expression "dataType = :dt AND acceleratorKey = :email" \
  --expression-attribute-values '{":dt":{"S":"mandatoryAccount"},":email":{"S":"'"$EMAIL"'"}}' \
  --query 'Count' \
  --output text
```

Interpretation:

- `Count = 1` confirms one current row per key, not multiple commit versions.

## Operational mitigation

Use strict non-overlap execution behavior for deploy-triggered pipeline runs:

1. Do not trigger a second deploy while a pipeline execution is still in progress.
2. Wait for the current execution to complete before uploading a new config artifact.
3. If overlap occurred, stop/cancel outdated runs and re-run a single deploy from the latest intended config state.

This avoids concurrent executions mutating shared config-table commit metadata in conflicting ways.

## Long-term upstream fix options

1. Commit-isolated storage model for config-table account mappings.
2. Explicitly enforced non-overlap execution model in LZA pipeline behavior and docs.

## Notes

- This runbook explains a specific concurrency race and should be used together with:
  - `docs/runbooks/initial-setup-common-issues.md`
