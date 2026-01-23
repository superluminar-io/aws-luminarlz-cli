# 1. AWS regions
[//]: # (TODO: Adapt or delete this ADR to your needs.)

## Context

Which AWS regions are we going to use?

## Decision

As home and operational region <<AWS_HOME_REGION>> will be used.

[//]: # (An exception are global AWS services that are only available in us-east-1.)

## Consequences

The regions <<AWS_HOME_REGION>> and eu-east-1 have a Control-Tower setup deployed.

[//]: # (The global region us-east-1 allows actions for global AWS services, e.g. IAM, CloudFront, Route53, etc.)
[//]: # (For all other regions, access will be denied by Control Tower Region Deny.)
