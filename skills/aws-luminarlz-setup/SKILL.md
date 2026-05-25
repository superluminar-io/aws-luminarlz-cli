---
name: aws-luminarlz-setup
description: Use when setting up a new or resuming a partial AWS multi-account landing zone using the Landing Zone Accelerator (LZA) and aws-luminarlz-cli. Requires AWS management account credentials in the environment and a git repository as the working directory.
allowed-tools: Bash(aws sts get-caller-identity*) Bash(aws ce get-cost-and-usage *) Bash(aws ce list-cost-allocation-tags *) Bash(aws cloudformation describe-stacks *) Bash(aws cloudformation describe-stack-resources *) Bash(aws cloudformation wait *) Bash(aws cloudtrail lookup-events *) Bash(aws codepipeline get-pipeline-state *) Bash(aws controltower get-landing-zone *) Bash(aws controltower list-landing-zones *) Bash(aws iam list-users *) Bash(aws iam list-mfa-devices *) Bash(aws identitystore list-groups *) Bash(aws identitystore list-users *) Bash(aws logs describe-log-groups *) Bash(aws organizations describe-organization *) Bash(aws organizations describe-account *) Bash(aws organizations list-roots *) Bash(aws service-quotas get-service-quota *) Bash(aws servicecatalog search-provisioned-products *) Bash(aws sso-admin list-instances *) Bash(grep *) Bash(find *)
---

# AWS LZA Landing Zone Setup

## Overview

Step-by-step guide to deploy an AWS multi-account landing zone following the [superluminar internal guide](https://www.notion.so/3-a-Landing-zone-accelerator-LZA-deployment-1a5d4d1b9f4d808a83fed26ed468c2e0). Can start fresh or resume a partial setup.

**Required before starting:**
- AWS credentials with administrator permissions for the Management account set in the environment
- Working directory is a git repository

**Never invent values** — always ask the user for: email addresses, account names, AWS regions, org identifiers, usernames.

---

## Step 0: Detect current state

```bash
# Check 1: luminarlz already initialized?
ls config.ts 2>/dev/null && echo "INITIALIZED"

# Check 2: LZA pipeline stack exists? Ask user for home region first.
aws cloudformation describe-stacks \
  --stack-name AWSAccelerator-PipelineStack \
  --region HOME_REGION \
  --query 'Stacks[0].StackStatus' --output text 2>/dev/null

# Check 3: AWS Organization exists?
aws organizations describe-organization \
  --query 'Organization.Id' --output text 2>/dev/null
```

- `config.ts` exists → **jump to Phase 5**
- `AWSAccelerator-PipelineStack` exists → **jump to Phase 4**
- AWS Organization exists → **jump to Phase 3**
- Otherwise → **start at Phase 1**

---

## Phase 1: Planning & Prerequisites

Collect the following **from the user** before proceeding. Do not guess.

| Item | Notes |
|------|-------|
| Company/org identifier | Short prefix for email sub-addressing, e.g. `aws` |
| Email group address | e.g. `aws@example.com` — must support sub-addressing |
| Home region | e.g. `eu-central-1` (for German companies) |
| Operational regions | Additional regions for workloads |
| OU structure | Minimum: Security (Audit, LogArchive), Workloads (Prod, Test) |
| Account name conventions | Max 50 chars per account name |

**Constraints to verify with the user:**
- Root emails max **64 characters** (including the `+subaddress` part)
- Account names max **50 characters**
- Email group has **more than one subscriber**
- Email group supports **sub-addressing** (e.g. `aws+management@example.com`)

**Example email conventions:**

| Account | Root Email Pattern |
|---------|--------------------|
| Management | `[org]+management@example.com` |
| LogArchive | `[org]+security-log-archive@example.com` |
| Audit | `[org]+security-audit@example.com` |
| Workload prod | `[org]+workloads-[name]-production@example.com` |
| Sandbox | `[org]+sandbox-[firstname.lastname]@example.com` |

**Checklist before moving to Phase 2:**
- [ ] OU structure documented
- [ ] Account aliases and root emails defined for: Management, LogArchive, Audit, and planned workload accounts
- [ ] Home region selected
- [ ] Email admin contact confirmed with client

---

## Phase 2: Management Account

These steps require **root access** to the AWS account and cannot be automated via CLI. Walk the user through each one and confirm it is done before proceeding.

- [ ] Management account root email set to the email group *(root console only)*
- [ ] MFA device set up for each person in the email group *(root console only)*
- [ ] Root account name set to `Management` *(console: top-right account menu → Account → Account name)*
- [ ] IAM user access to Billing Console activated *(console: Billing → Account → IAM user and role access to Billing information → Activate)*
- [ ] TRN number set in tax settings *(console: Billing → Tax settings)*

After the user confirms these are done, verify what you can:

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "Management account ID: $ACCOUNT_ID"

# Verify billing access is active (will fail with AccessDeniedException if not)
aws ce get-cost-and-usage \
  --time-period Start=$(date -d "2 days ago" +%Y-%m-%d),End=$(date -d "1 day ago" +%Y-%m-%d) \
  --granularity DAILY --metrics BlendedCost \
  --query 'ResultsByTime[0].Total.BlendedCost.Amount' --output text 2>&1 \
  | grep -q "AccessDeniedException" \
  && echo "WARNING: IAM billing access not yet activated" \
  || echo "Billing access OK"
```

---

## Phase 3: Deploy LZA

### 3.1 Create AWS Organization

```bash
aws organizations create-organization --feature-set ALL

# Verify and capture IDs needed later
ORG_ID=$(aws organizations describe-organization --query 'Organization.Id' --output text)
ROOT_ID=$(aws organizations list-roots --query 'Roots[0].Id' --output text)
echo "Organization ID: $ORG_ID"
echo "Root OU ID: $ROOT_ID"

# Now verify the Management account name (requires org to exist)
aws organizations describe-account \
  --account-id $(aws sts get-caller-identity --query Account --output text) \
  --query 'Account.Name' --output text
# If this is not "Management", ask the user to correct it in Account Settings
```

### 3.2 Check LZA prerequisites

```bash
# Check CodeBuild concurrency quota (commonly too low on new accounts — minimum recommended: 20)
QUOTA=$(aws service-quotas get-service-quota \
  --service-code codebuild \
  --quota-code L-ACCF6C0D \
  --region HOME_REGION \
  --query 'Quota.Value' --output text)
echo "Current CodeBuild concurrency quota: $QUOTA"

if (( $(echo "$QUOTA < 20" | bc -l) )); then
  echo "Requesting quota increase to 20..."
  aws service-quotas request-service-quota-increase \
    --service-code codebuild \
    --quota-code L-ACCF6C0D \
    --desired-value 20 \
    --region HOME_REGION
fi
```

Create the GitHub token secret (**ask the user for their GitHub personal access token**):

```bash
aws secretsmanager create-secret \
  --name accelerator/github-token \
  --secret-string "GITHUB_PERSONAL_ACCESS_TOKEN" \
  --region HOME_REGION
```

### 3.3 Deploy the CloudFormation installer stack

**This step requires the console** — direct the user to the [LZA launch button](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/step-1.-launch-the-stack.html). They must switch to the home region first, then use these settings:

| Parameter | Value |
|-----------|-------|
| Stack name | `AWSAccelerator-InstallerStack` |
| Control Tower Environment | `Yes` |
| Enable Approval Stage | `No` |
| Configuration Repository Location | `S3` |
| Management Account Email | per convention |
| LogArchive Account Email | per convention |
| Audit Account Email | per convention |

> **Warning:** Several parameters cannot be changed after deployment. Ask the user to review carefully before launching.

Tell the user to notify you once they have clicked Launch, then:

### 3.4 Wait for the installer stack and initial pipeline run

```bash
echo "Waiting for AWSAccelerator-InstallerStack..."
aws cloudformation wait stack-create-complete \
  --stack-name AWSAccelerator-InstallerStack \
  --region HOME_REGION

echo "Waiting for AWSAccelerator-PipelineStack to be created..."
aws cloudformation wait stack-create-complete \
  --stack-name AWSAccelerator-PipelineStack \
  --region HOME_REGION

echo "Waiting for initial pipeline run to succeed (this takes ~30–60 minutes)..."
while true; do
  STATUS=$(aws codepipeline get-pipeline-state \
    --name AWSAccelerator-Pipeline \
    --region HOME_REGION \
    --query 'stageStates[-1].latestExecution.status' \
    --output text 2>/dev/null)
  echo "  Pipeline status: $STATUS"
  [[ "$STATUS" == "Succeeded" ]] && echo "Pipeline succeeded." && break
  [[ "$STATUS" == "Failed" ]] && echo "ERROR: Pipeline failed. Check CodePipeline console." && exit 1
  sleep 60
done
```

### 3.5 Disable default VPC creation in Control Tower Account Factory

```bash
# Find the Account Factory provisioned product
PRODUCT_ID=$(aws servicecatalog search-provisioned-products \
  --region HOME_REGION \
  --query "ProvisionedProducts[?contains(Name,'Account-vending') || contains(Name,'AccountFactory')].Id | [0]" \
  --output text)

echo "Account Factory product ID: $PRODUCT_ID"

# Update to disable VPC provisioning
aws servicecatalog update-provisioned-product \
  --region HOME_REGION \
  --provisioned-product-id "$PRODUCT_ID" \
  --provisioning-parameters '[{"Key":"VPCOptions","Value":"No"}]'
```

If this fails (parameter keys vary by Control Tower version), fall back to the console: Control Tower → Account Factory → Edit → uncheck "Create VPC when provisioning an account".

---

## Phase 4: Initialize luminarlz

### 4.1 Verify credentials point to the Management account

```bash
aws sts get-caller-identity
```

### 4.2 Initialize the project

```bash
npx @superluminar-io/aws-luminarlz-cli init
npm install
```

### 4.3 Add LZA checkout to `.gitignore`

```bash
grep -qxF '/.landing-zone-accelerator-on-aws-*' .gitignore \
  || echo '/.landing-zone-accelerator-on-aws-*' >> .gitignore
```

### 4.4 Configure `config.ts` — interview style

Read `config.ts` and go through each `TODO` and `<<placeholder>>` **one at a time**:
- Explain what each value is for
- Ask the user — never fill in values they haven't explicitly provided
- If a TODO is marked optional, offer to skip it; note skipped items for later

Retrieve commonly needed values from AWS:

```bash
# Management account ID
aws sts get-caller-identity --query Account --output text

# Organization and root OU IDs
aws organizations describe-organization --query 'Organization.Id' --output text
aws organizations list-roots --query 'Roots[0].Id' --output text

# CloudTrail log group name created by Control Tower
aws logs describe-log-groups \
  --region HOME_REGION \
  --log-group-name-prefix "aws-controltower" \
  --query 'logGroups[*].logGroupName' --output text

# Current LZA installer version
aws cloudformation describe-stacks \
  --stack-name AWSAccelerator-InstallerStack \
  --region HOME_REGION \
  --query 'Stacks[0].Parameters[?ParameterKey==`RepositoryBranchName`].ParameterValue' \
  --output text
```

### 4.5 Validate the config before deploying

```bash
npm run cli -- lza config validate
```

### 4.6 Deploy

```bash
npm run cli -- deploy
```

### 4.7 Trigger and wait for the pipeline (first run must be started manually)

```bash
aws codepipeline start-pipeline-execution \
  --name AWSAccelerator-Pipeline \
  --region HOME_REGION

echo "Waiting for pipeline to succeed (this takes ~30–60 minutes)..."
while true; do
  STATUS=$(aws codepipeline get-pipeline-state \
    --name AWSAccelerator-Pipeline \
    --region HOME_REGION \
    --query 'stageStates[-1].latestExecution.status' \
    --output text)
  echo "  Pipeline status: $STATUS"
  [[ "$STATUS" == "Succeeded" ]] && echo "Pipeline succeeded." && break
  [[ "$STATUS" == "Failed" ]] && echo "ERROR: Pipeline failed. Check CodePipeline console." && exit 1
  sleep 60
done
```

### 4.8 Resolve remaining TODOs — interview style

```bash
grep -rn "TODO" . --include="*.ts" --include="*.yaml" --include="*.json" --include="*.md" \
  | grep -v node_modules | grep -v ".git"
```

Go through each TODO **one at a time**:
- Explain what it is asking for
- If optional, offer to skip it
- Only fill in values the user explicitly provides
- Keep a running list of intentionally skipped TODOs for follow-up

### 4.9 Review and update ADRs

```bash
find docs/adrs -name "*.md" | sort
```

Read each ADR and do the following for each:

1. **Fill in placeholders** — replace `<<placeholder>>` values using decisions made during the setup (regions, email conventions, naming conventions, etc.)
2. **Add the date** — add `Date: YYYY-MM-DD` (today's date) at the top of the file
3. **Resolve TODO comments** — adapt or remove them; ask the user if the decision differs from the template default

Then check whether the following important decisions are documented. If an ADR is missing, create it — **interview the user** for the decision details:

| Decision | Expected ADR |
|----------|-------------|
| Which AWS regions are used and why | `001-aws-regions.md` (template exists) |
| Account naming convention | `002-aws-account-naming-conventions.md` (template exists) |
| Root email conventions | `003-aws-root-email-conventions.md` (template exists) |
| OU structure and rationale | `004-ou-structure.md` — create if missing |
| Identity provider choice | `005-identity-provider.md` — create if an external IdP was configured |
| Break glass access approach | `006-break-glass-access.md` — create if missing |

Use this template for new ADRs:

```markdown
# N. Title
Date: YYYY-MM-DD

## Context

[Why did this decision need to be made?]

## Decision

[What was decided?]

## Consequences

[What are the implications — positive and negative?]
```

---

## Phase 5: Additional Configuration

### IAM Identity Center

First ask the user whether groups will be created **manually** in IAM Identity Center or synced from an **external IdP** (Entra ID, Okta, etc.). If an external IdP is in use, skip manual group creation — groups will replicate automatically after the IdP is connected.

Check the Identity Center instance and existing groups:

```bash
INSTANCE_ARN=$(aws sso-admin list-instances --region HOME_REGION --query 'Instances[0].InstanceArn' --output text)
IDENTITY_STORE_ID=$(aws sso-admin list-instances --region HOME_REGION --query 'Instances[0].IdentityStoreId' --output text)
echo "Identity Store ID: $IDENTITY_STORE_ID"

# List existing groups — compare against the group names in config.ts
aws identitystore list-groups \
  --identity-store-id "$IDENTITY_STORE_ID" \
  --region HOME_REGION \
  --query 'Groups[*].DisplayName' --output text

# List existing users
aws identitystore list-users \
  --identity-store-id "$IDENTITY_STORE_ID" \
  --region HOME_REGION \
  --query 'Users[*].UserName' --output text
```

The group names must **exactly match** the values in `config.ts` `Groups` object (e.g. `aws-administrator`, `aws-developer`, `aws-billing`). Check `config.ts` for the exact names — do not assume. Create any groups that are missing and not provided by an IdP:

```bash
# Example — use the actual names from config.ts
aws identitystore create-group \
  --identity-store-id "$IDENTITY_STORE_ID" \
  --region HOME_REGION \
  --display-name "aws-administrator" \
  --description "AWS administrators with full access"

aws identitystore create-group \
  --identity-store-id "$IDENTITY_STORE_ID" \
  --region HOME_REGION \
  --display-name "aws-billing" \
  --description "AWS billing reviewers"
```

- [ ] All groups from `config.ts` `Groups` object exist in Identity Center
- [ ] Admin users are assigned to the administrator group
- [ ] Users are present in format `firstname.lastname`

### Update README with SSO sign-in URL

```bash
IDENTITY_STORE_ID=$(aws sso-admin list-instances --query 'Instances[0].IdentityStoreId' --output text)
echo "SSO URL: https://${IDENTITY_STORE_ID}.awsapps.com/start"
# Update the README.md TODO placeholder with this URL
```

### Control Tower region deny

> **Note:** `AWS-GR_REGION_DENY` cannot be enabled via the CLI. The `enable-control` API rejects both Root and OU targets with: *"AWS-GR_REGION_DENY control can only be enabled through the landing zone settings."*

This **must** be done in the console:

> Control Tower → Landing zone settings → Region deny → Enable

After the user confirms it is enabled, verify the governed regions match `ENABLED_REGIONS` in `config.ts`:

```bash
aws controltower get-landing-zone \
  --landing-zone-identifier "$(aws controltower list-landing-zones --region HOME_REGION \
    --query 'landingZones[0].arn' --output text)" \
  --region HOME_REGION \
  --query 'landingZone.manifest.governedRegions' \
  --output text
```

### Break glass access

Follow the runbook generated in the initialized project. **Test that break glass access works before proceeding to Phase 6.**

Ask the user for the break glass username if unsure, then verify both MFA and at least one successful login:

```bash
# List IAM users to identify the break glass user
aws iam list-users --query 'Users[*].UserName' --output text

# Check MFA devices
MFA_DEVICES=$(aws iam list-mfa-devices --user-name BREAKGLASS_USERNAME \
  --query 'MFADevices[*].SerialNumber' --output text)

if [[ -z "$MFA_DEVICES" ]]; then
  echo "ERROR: Break glass user has no MFA device configured. Set up MFA before continuing."
else
  echo "MFA configured: $MFA_DEVICES"
fi

# Check CloudTrail for at least one successful console login by the break glass user
LOGIN_COUNT=$(aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=Username,AttributeValue=BREAKGLASS_USERNAME \
  --region HOME_REGION \
  --query "Events[?EventName=='ConsoleLogin'] | length(@)" \
  --output text)

if [[ "$LOGIN_COUNT" == "0" || -z "$LOGIN_COUNT" ]]; then
  echo "ERROR: No console login found for break glass user. The user must log in at least once to confirm access works before you proceed."
else
  echo "Break glass login confirmed: $LOGIN_COUNT login(s) on record."
fi
```

---

## Phase 6: Cleanup & Hardening

### IAM cleanup (only after break glass is confirmed working)

Do not run any IAM deletion commands. Instead, remind the user to manually remove the temporary admin IAM user and their group via the console or CLI themselves.

Remind the user:

> Please delete the temporary admin IAM user (e.g. `temp-admin`) and its group from the IAM console or using the CLI. Do not delete any other IAM users or groups.

### Billing hardening

Check and enable tag policies (Control Tower often already enables this):

```bash
ROOT_ID=$(aws organizations list-roots --query 'Roots[0].Id' --output text)

# Check if TAG_POLICY is already enabled before trying to enable it
aws organizations list-roots --query 'Roots[0].PolicyTypes' --output json

# Only run this if TAG_POLICY is not already ENABLED:
# aws organizations enable-policy-type --root-id "$ROOT_ID" --policy-type TAG_POLICY
```

Check and activate cost allocation tags. The important keys are `Owner` and `AWSAcceleratorManaged` (and `Environment` once resources are tagged):

```bash
# List all known tags and their activation status
aws ce list-cost-allocation-tags \
  --query 'CostAllocationTags[*].{Key:TagKey,Status:Status}' --output table

# Activate the ones that matter — only activate keys that exist in the list above
aws ce update-cost-allocation-tags-status \
  --cost-allocation-tags-status \
    '[{"TagKey":"Owner","Status":"Active"},{"TagKey":"AWSAcceleratorManaged","Status":"Active"}]'
# Note: activating a tag key that doesn't exist yet returns a 404 error for that key — safe to ignore
```

Verify cost categories were deployed by the LZA pipeline:

```bash
# Cost categories are deployed via CloudFormation by the customizations stack
aws cloudformation describe-stack-resources \
  --stack-name LzaCustomization-CostCategories \
  --region HOME_REGION \
  --query 'StackResources[?ResourceType==`AWS::CE::CostCategory`].{Id:PhysicalResourceId,Status:ResourceStatus}' \
  --output table 2>/dev/null || echo "Cost categories stack not yet deployed — run pipeline first"
```

The following must be done by the user in the console (no CLI available):

- [ ] [Tax inheritance enabled](https://us-east-1.console.aws.amazon.com/billing/home#/tax-settings) — prevents member accounts from changing tax settings
- [ ] Consider enabling PDF invoice delivery (Cost Management → Preferences)
- [ ] Confirm the three cost categories (Environment, OrganizationalUnit, Owner) are present in Cost Explorer → Cost categories

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Not starting pipeline manually after first deploy | Always run `start-pipeline-execution` for the first run |
| Inventing email addresses | Root emails cannot be changed after account creation — always ask |
| Skipping CodeBuild quota check | New accounts hit the default concurrency limit during first LZA run |
| Not disabling VPC creation in Account Factory | Every new account gets an unwanted default VPC |
| Deleting IAM users before break glass works | Risk of total lockout — verify break glass first |
| Forgetting `.landing-zone-accelerator-on-aws-*` in `.gitignore` | LZA local checkout gets committed to the repo |
| Deploying LZA in wrong region | Must switch to home region before launching the installer stack |
| Leaving ADR placeholders unfilled | ADRs with `<<placeholders>>` are not useful documentation — fill them in |
