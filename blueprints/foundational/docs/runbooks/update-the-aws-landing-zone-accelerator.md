# Update the AWS Landing Zone Accelerator

## Requirements

- Administrator access to the `Management` account.

## Update Steps

- Review LZA [releases](https://github.com/awslabs/landing-zone-accelerator-on-aws/releases/).
- Check that the pipelines are up to date and in a successful state.
- Update
  solution: [Link](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/update-the-solution.html).
- Verify both pipelines did deploy correctly.
- Set the new `awsAcceleratorVersion` in the `config` object in [config.ts](../../config.ts).
