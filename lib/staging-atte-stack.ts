import * as cdk from "aws-cdk-lib";
import * as assets from "aws-cdk-lib/aws-s3-assets";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as path from "path";
import { Construct } from "constructs";
import { AtteServer } from "./atte-server";
import { DatabaseServer } from "./database-server";

export class StagingAtteStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const archive = new assets.Asset(this, "AtteArchive", {
      path: path.join(__dirname, "../assets/atte-1.3.1.zip"),
    });

    const vpc = new ec2.Vpc(this, "Vpc", {
      ipAddresses: ec2.IpAddresses.cidr("10.0.0.0/16"),
      natGateways: 0,
      maxAzs: 2,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "Public",
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: "Private",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });

    const dbServer = new DatabaseServer(this, "Database", {
      vpc,
    });

    const atteServer = new AtteServer(this, "Ec2Instance", {
      vpc,
      archive,
      dbHost: dbServer.instance.dbInstanceEndpointAddress,
      dbSecretId: dbServer.instance.secret?.secretArn ?? "",
    });

    archive.grantRead(atteServer.instance);
    dbServer.instance.grantConnect(atteServer.instance);
    dbServer.instance.secret?.grantRead(atteServer.instance);

    dbServer.instance.connections.allowFrom(
      atteServer.instance,
      ec2.Port.tcp(3306)
    );

    new cdk.CfnOutput(this, "PublicIp", {
      value: atteServer.instance.instancePublicIp,
    });
  }
}
