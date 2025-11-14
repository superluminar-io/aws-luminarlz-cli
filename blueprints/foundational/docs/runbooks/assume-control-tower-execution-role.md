# Assume Control Tower Execution Role

On member accounts of the AWS organization there are some custom guardrails in place that prevent even users with `AdministratorAccess` from specific actions like e.g., deleting a CloudFormation stack with an `LzaCustomization-` prefix.
Therefore, to perform certain operations, you may need to assume the **Control Tower Execution Role**.
This is particularly useful during development or debugging of LZA Customization stacks.

## Requirements

- You can access the `Management` account with `AdministratorAccess`.
- You have the **account ID** of the target account in which you want to assume the `AWSControlTowerExecution` role.

## Steps

1. Open <https://<<AWS_IDENTITY_STORE_ID>>.awsapps.com/start>.
2. You should see a list of AWS accounts that you have access to.
3. Note down the **account ID** of the target account where you want to assume the role.
4. Log in to the `Management` account with an admin permission set.
5. In the upper-right corner of the AWS Console, click on your username and then the arrow next to **Add session**.
6. Enter the **Account ID** of the target account.
7. Select the `AWSControlTowerExecution` role.
8. (Optional) Enter a display name for the session.
9. (Optional) Choose a display color to help distinguish this session.
10. Click **Switch role**.
11. The session will now be available in the session menu for quick access in the future.
