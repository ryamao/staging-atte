import * as cdk from "aws-cdk-lib";
import * as assets from "aws-cdk-lib/aws-s3-assets";
import { Construct } from "constructs";
import * as path from "path";

export class StagingAtteStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const archive = new assets.Asset(this, "AtteArchive", {
      path: path.join(__dirname, "../assets/atte-1.3.0.zip"),
    });

    new cdk.CfnOutput(this, "AtteArchiveBucketName", {
      value: archive.s3BucketName,
    });
    new cdk.CfnOutput(this, "AtteArchiveHttpUrl", {
      value: archive.httpUrl,
    });
    new cdk.CfnOutput(this, "AtteArchiveObjectUrl", {
      value: archive.s3ObjectUrl,
    });
  }
}
