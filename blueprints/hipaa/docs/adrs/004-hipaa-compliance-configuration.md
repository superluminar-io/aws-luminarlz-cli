# ADR-004: HIPAA Compliance Configuration

## Status

Accepted

## Context

This Landing Zone configuration is designed to support HIPAA (Health Insurance Portability and Accountability Act) 
compliant workloads on AWS. HIPAA requires specific security, privacy, and administrative safeguards to protect 
Protected Health Information (PHI).

## Decision

We have configured the Landing Zone Accelerator to include the following HIPAA-aligned controls:

### Security Controls

1. **AWS Security Hub with HIPAA Security Standard**: Enabled to continuously monitor compliance with HIPAA requirements
2. **Amazon GuardDuty**: Enabled for intelligent threat detection across all accounts
3. **Amazon Macie**: Enabled for automated discovery and protection of PHI in S3 buckets
4. **AWS Config Rules**: Configured with HIPAA-specific compliance rules including:
   - Encryption validation for EBS, RDS, and S3
   - CloudTrail and logging enablement checks
   - MFA enforcement validation
   - Network security assessments

### Encryption

1. **Encryption at Rest**: 
   - All EBS volumes require encryption (enforced via policy)
   - KMS keys with automatic rotation enabled
   - S3 bucket encryption enforced
   - RDS encryption validated via AWS Config

2. **Encryption in Transit**:
   - TLS/SSL enforced for all data transmission (validated via Config rules)

### Logging and Monitoring

1. **Extended Log Retention**: 
   - CloudWatch Logs: 7 years (2555 days)
   - S3 Access Logs: 10 years (3650 days)
   - Central Log Bucket: 7 years (2555 days)
   - CloudTrail Logs: 7 years (via Control Tower)

2. **Comprehensive Logging**:
   - CloudTrail organization trail enabled
   - VPC Flow Logs enabled and validated
   - Session Manager logging to S3 and CloudWatch
   - CloudWatch Logs centralization enabled

### Access Controls

1. **IAM Password Policy**: Enhanced requirements aligned with HIPAA
   - Minimum 14 characters
   - Complexity requirements (upper, lower, numbers, symbols)
   - 90-day maximum age
   - 24 password history

2. **MFA Enforcement**: Validated via AWS Config rules
3. **IAM Access Analyzer**: Enabled for detecting unintended access

### Audit and Compliance

1. **AWS Config**: Configuration recorder enabled across all regions and accounts
2. **Security Hub**: Real-time compliance monitoring with HIPAA security standard
3. **SNS Notifications**: Security alerts sent to designated security team

## Consequences

### Positive

- Provides a strong foundation for HIPAA-compliant workloads
- Automated compliance monitoring and alerting
- Comprehensive audit trails for investigations
- Defense-in-depth security approach

### Negative

- Higher AWS costs due to enabled security services and extended log retention
- Requires ongoing maintenance and review of security findings
- May require additional controls based on specific organizational risk analysis

## Compliance Note

**Important**: This configuration provides technical controls aligned with HIPAA requirements, but it does not 
guarantee HIPAA compliance on its own. Organizations must:

1. Conduct a thorough risk analysis
2. Implement administrative and physical safeguards
3. Sign Business Associate Agreements (BAAs) with AWS
4. Maintain policies and procedures
5. Conduct regular security assessments and audits
6. Implement breach notification procedures
7. Provide workforce training

## References

- [AWS HIPAA Compliance](https://aws.amazon.com/compliance/hipaa-compliance/)
- [HIPAA Security Rule](https://www.hhs.gov/hipaa/for-professionals/security/index.html)
- [AWS Security Hub HIPAA Standard](https://docs.aws.amazon.com/securityhub/latest/userguide/hipaa-standard.html)
- [Landing Zone Accelerator on AWS](https://aws.amazon.com/solutions/implementations/landing-zone-accelerator-on-aws/)
