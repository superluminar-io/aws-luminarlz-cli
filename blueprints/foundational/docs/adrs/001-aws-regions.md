# 1. AWS regions
[//]: # (TODO: Adapt or delete this ADR to your needs.)

## Context

Which regions are we going to use?

## Decision

As home and operational region <<AWS_HOME_REGION>> will be used.
An exception are some global AWS services or AWS services that are only available in us-east-1.

## Consequences

Only the regions eu-central-1 and eu-east-1 are allowed to be used and have a Control-Tower setup deployed.
For all other regions, access will be denied by Control Tower Guardrails (implemented via Service Control Policies).
