# Set up GitHub Actions to deploy to AWS

## Requirements

- An AWS account that has an OIDC provider for GitHub Actions configured.
- The role that GitHub Actions will assume to deploy to AWS, e.g. arn:aws:iam::<account-id>:role/github-actions-role
- The AWS region, e.g. eu-central-1

## Steps

- Follow
  the [GitHub Actions guide for OIDC with AWS](https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services#updating-your-github-actions-workflow)
  using the values from the prerequisites.
