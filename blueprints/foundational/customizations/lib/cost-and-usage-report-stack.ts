import { Stack, StackProps } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cur from 'aws-cdk-lib/aws-cur';
import { Construct } from 'constructs';
import { PolicyStatement, ServicePrincipal } from 'aws-cdk-lib/aws-iam';

/**
 * Creates an hourly Cost and Usage Report (CUR) in the parquet format.
 */
export class CostAndUsageReportStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, 'CurBucket');
    const conditions = {
      StringEquals: {
        'aws:SourceArn': `arn:aws:cur:${this.region}:${this.account}:definition/*`,
        'aws:SourceAccount': this.account,
      },
    };
    bucket.addToResourcePolicy(
      new PolicyStatement({
        actions: ['s3:GetBucketAcl', 's3:GetBucketPolicy'],
        resources: [bucket.bucketArn],
        principals: [new ServicePrincipal('billingreports.amazonaws.com')],
        conditions,
      }),
    );
    bucket.addToResourcePolicy(
      new PolicyStatement({
        actions: ['s3:PutObject'],
        resources: [`${bucket.bucketArn}/*`],
        principals: [new ServicePrincipal('billingreports.amazonaws.com')],
        conditions,
      }),
    );

    const report = new cur.CfnReportDefinition(this, 'CurHourly', {
      reportName: 'cur-hourly',
      s3Bucket: bucket.bucketName,
      format: 'Parquet',
      compression: 'Parquet',
      s3Prefix: 'cur-hourly',
      reportVersioning: 'OVERWRITE_REPORT',
      s3Region: this.region,
      timeUnit: 'HOURLY',
      refreshClosedReports: true,
    });
    // wait for bucket policy to be created before adding dependency
    report.addDependency(
      bucket.policy!.node.defaultChild as s3.CfnBucketPolicy,
    );
  }
}
