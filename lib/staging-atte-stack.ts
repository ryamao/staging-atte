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
      path: path.join(__dirname, "../assets/atte-1.3.1.zip"),
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
      archive: archive,
    });
    archive.grantRead(atteServer.instance.role);

    new cdk.CfnOutput(this, "PublicIp", {
      value: atteServer.instance.instancePublicIp,
    });
  }
}
