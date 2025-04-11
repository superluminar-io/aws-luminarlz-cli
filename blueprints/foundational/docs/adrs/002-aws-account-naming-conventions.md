# 2. AWS account naming convention
[//]: # (TODO: Adapt this ADR to your needs or delete it.)

## Context

- AWS accounts should be named consistently to make it easier to identify the purpose of the account.
- AWS account names have a [maximum length of 50 characters](https://docs.aws.amazon.com/organizations/latest/APIReference/API_Account.html).

## Decision

Based on the [AWS guidelines](https://aws.amazon.com/solutions/guidance/establishing-an-initial-foundation-using-control-tower-on-aws/?did=sl_card&trk=sl_card) for naming accounts.
We will use the following naming convention for AWS accounts:

- Account names are written `UpperCamelCase`.
