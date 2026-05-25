---
name: aws-luminarlz-deploy
description: Use when deploying a new or updated LZA config in a luminarlz project. Validates the config first, then deploys and monitors the pipeline. Triggers on phrases like "deploy lza config", "deploy landing zone", "update lza", "run lza deploy", or "push lza config".
allowed-tools: Bash(aws sts get-caller-identity*) Bash(aws cloudformation describe-stacks *) Bash(aws cloudformation wait *) Bash(aws codepipeline get-pipeline-state *) Bash(npm run cli -- synth*) Bash(npm run cli -- lza config validate*) Bash(npm run cli -- lza installer-version check*)
---

# AWS luminarlz Deploy

Validates and deploys the LZA config, then monitors the pipeline to completion.

**Required before starting:**
- AWS credentials with administrator permissions for the Management account set in the environment
- Working directory is a luminarlz project (`config.ts` exists)

---

## Step 1: Verify credentials

```bash
aws sts get-caller-identity
```

Confirm the account ID matches the `MANAGEMENT_ACCOUNT_ID` in `config.ts` before proceeding.

## Step 2: Check LZA installer version

```bash
npm run cli -- lza installer-version check
```

If the local version in `config.ts` does not match the deployed installer, stop and ask the user whether to update the version or abort.

## Step 3: Validate config

```bash
npm run cli -- lza config validate
```

If validation fails, show the errors and stop. Do not deploy with a failing config.

## Step 4: Deploy

```bash
npm run cli -- deploy
```

## Step 5: Monitor pipeline

```bash
echo "Waiting for AWSAccelerator-Pipeline to succeed..."
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

Ask the user for HOME_REGION if it is not already known from `config.ts`.
