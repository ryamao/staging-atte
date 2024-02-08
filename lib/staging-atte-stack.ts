import * as cdk from "aws-cdk-lib";
import * as assets from "aws-cdk-lib/aws-s3-assets";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as path from "path";
import { Construct } from "constructs";
import { AtteServer } from "./atte-server";

export class StagingAtteStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const archive = new assets.Asset(this, "AtteArchive", {
      path: path.join(__dirname, "../assets/atte-1.3.0.zip"),
    });

    const vpc = new ec2.Vpc(this, "Vpc", {
      natGateways: 0,
      maxAzs: 1,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "Public",
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    });

    const atteServer = new AtteServer(this, "Ec2Instance", {
      vpc,
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
