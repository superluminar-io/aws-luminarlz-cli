# 3. AWS root email conventions
[//]: # (TODO: Adapt this ADR to your needs or delete it.)

## Context

AWS root email addresses...:

- have a [maximum length of 64 characters](https://docs.aws.amazon.com/organizations/latest/APIReference/API_Account.html).
- must be unique across all AWS accounts.
- should be named consistently to make it easier to sort and filter the email notifications.
- should be sent to one email group to make management easier.

## Decision

Based on the [AWS guidelines](https://aws.amazon.com/solutions/guidance/establishing-an-initial-foundation-using-control-tower-on-aws/?did=sl_card&trk=sl_card) for root emails, it was decided for the following conventions:

`<<AWS_ACCOUNTS_ROOT_EMAIL | split: "@" | join: "+<ou-name>-<account-name>@" >>`

- We use `<<AWS_ACCOUNTS_ROOT_EMAIL>>` using sub-addressing to differentiate between the accounts, e.g.: `<<AWS_ACCOUNTS_ROOT_EMAIL | split: "@" | join: "+management@" >>`
- Email addresses include the OU name to make it easier to sort and filter the email notifications, e.g. `<<AWS_ACCOUNTS_ROOT_EMAIL | split: "@" | join: "+security-audit@" >>`.

## Consequences

If there's the need to send specific email notifications to other audiences (e.g. developers, security team, etc.) alternate contacts should be used.
