---
name: aws-luminarlz-deployment-status
description: Use when checking the status of an LZA config deployment or waiting for it to complete. Requires the S3 version ID printed by the deploy command. Triggers on phrases like "check deployment status", "wait for deployment", "did the pipeline succeed", or "what's the status of my LZA deployment".
allowed-tools: Bash(aws sts get-caller-identity*) Bash(aws s3api head-object *) Bash(aws codepipeline list-pipeline-executions *) Bash(aws codepipeline get-pipeline-state *) Bash(aws codepipeline get-pipeline-execution *)
---

# AWS luminarlz Deployment Status

Check or wait on the LZA pipeline triggered by a specific config deployment.

**Required before starting:**
- AWS credentials for the Management account set in the environment
- The S3 version ID printed by `npm run cli -- deploy` (or the `aws-luminarlz-deploy` skill)

---

## Step 1: Get the version ID

If the user has not provided a version ID, ask:

> What is the S3 version ID from your last deployment? It was printed by the deploy command as `Config uploaded. S3 version ID: <version-id>`.

---

## Step 2: Resolve bucket name and region from config.ts

Read `config.ts` to get `managementAccountId` and `homeRegion`. The bucket name is:

```
aws-accelerator-config-<managementAccountId>-<homeRegion>
```

---

## Step 3: Get the upload timestamp for the version

```bash
UPLOAD_TIME=$(aws s3api head-object \
  --bucket aws-accelerator-config-MANAGEMENT_ACCOUNT_ID-HOME_REGION \
  --key zipped/aws-accelerator-config.zip \
  --version-id VERSION_ID \
  --region HOME_REGION \
  --query 'LastModified' \
  --output text)
echo "Config uploaded at: $UPLOAD_TIME"
```

---

## Step 4: Find the matching pipeline execution

List recent pipeline executions and find the one that started after the upload:

```bash
aws codepipeline list-pipeline-executions \
  --pipeline-name AWSAccelerator-Pipeline \
  --region HOME_REGION \
  --max-results 10 \
  --query 'pipelineExecutionSummaries[*].{id:pipelineExecutionId,started:startTime,status:status}' \
  --output table
```

The matching execution is the one whose `startTime` is closest to and after `UPLOAD_TIME`. Note the `pipelineExecutionId`.

---

## Step 5: Report status

```bash
aws codepipeline get-pipeline-state \
  --name AWSAccelerator-Pipeline \
  --region HOME_REGION \
  --query 'stageStates[*].{stage:stageName,status:latestExecution.status}' \
  --output table
```

Report the overall status and which stage is currently running or failed.

---

## Step 6 (optional): Wait for completion

Ask the user: "Would you like me to wait for the pipeline to complete?"

If yes:

```bash
echo "Waiting for AWSAccelerator-Pipeline to complete..."
while true; do
  STATUS=$(aws codepipeline get-pipeline-state \
    --name AWSAccelerator-Pipeline \
    --region HOME_REGION \
    --query 'stageStates[-1].latestExecution.status' \
    --output text)
  echo "  Pipeline status: $STATUS"
  [[ "$STATUS" == "Succeeded" ]] && echo "Deployment complete." && break
  [[ "$STATUS" == "Failed" ]] && echo "ERROR: Pipeline failed. Check CodePipeline console." && exit 1
  sleep 60
done
```

Ask the user for `HOME_REGION` if it is not already known from `config.ts`.
