# Pending Deploy Flow Troubleshooting

This runbook covers the pending deploy flow used when `aws-luminarlz-cli deploy` is executed while the accelerator pipeline is already running.

## Expected behavior

1. A running pipeline exists (`InProgress`).
2. `deploy` uploads `zipped/aws-accelerator-config-pending.zip`.
3. The active S3 trigger ignores `-pending` artifacts.
4. After the current pipeline execution finishes, a completion rule triggers a Lambda that:
   - copies `zipped/aws-accelerator-config-pending.zip` to `zipped/aws-accelerator-config.zip`
   - deletes `zipped/aws-accelerator-config-pending.zip`
5. The copy to the active key triggers exactly one new pipeline execution.

## Fast checks

1. Verify active S3 trigger filters only the active artifact key:

```bash
aws events describe-rule \
  --name <CONFIG_BUCKET_NOTIFICATIONS_RULE_NAME> \
  --region <HOME_REGION> \
  --query 'EventPattern' \
  --output text | jq .
```

Expected fragment:

```json
"object": {
  "key": ["zipped/aws-accelerator-config.zip"]
}
```

2. Verify completion rule and lambda exist:

```bash
aws cloudformation list-stack-resources \
  --stack-name LzaCustomization-AwsAcceleratorPipeline \
  --region <HOME_REGION> \
  --query "StackResourceSummaries[?contains(LogicalResourceId,'PipelineCompletionPromotePendingRule') || contains(LogicalResourceId,'PromotePendingConfigArtifactFn')].[LogicalResourceId,PhysicalResourceId,ResourceStatus,ResourceType]" \
  --output table
```

3. Verify pending flow marker exists:

```bash
aws ssm get-parameter \
  --name /accelerator/pending-deploy-flow/enabled \
  --region <HOME_REGION>
```

Expected value: `true`.

## Common failure: KMS access denied

Symptom in Lambda logs:

- `AccessDenied`
- `is not authorized to perform: kms:GenerateDataKey`

This means the promotion Lambda can read/write S3 objects but cannot use the KMS key that encrypts the config bucket objects.

Fix:

1. Deploy the latest `LzaCustomization-AwsAcceleratorPipeline` stack from a version that includes KMS permissions for the promotion Lambda role.
2. Re-run a deploy while pipeline is in progress, or invoke the promotion Lambda once.
3. Confirm:
   - `zipped/aws-accelerator-config-pending.zip` is removed
   - `zipped/aws-accelerator-config.zip` has a new timestamp/version
   - a new pipeline execution starts

## Manual validation commands

```bash
aws logs tail \
  /aws/lambda/<PROMOTE_PENDING_LAMBDA_NAME> \
  --region <HOME_REGION> \
  --since 2h
```

```bash
aws lambda invoke \
  --function-name <PROMOTE_PENDING_LAMBDA_NAME> \
  --region <HOME_REGION> \
  --payload '{}' \
  /tmp/promote-pending-response.json
```
