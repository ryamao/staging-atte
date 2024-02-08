import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import { Construct } from "constructs";

export interface DatabaseServerProps {
  vpc: ec2.IVpc;
}

export class DatabaseServer extends Construct {
  public readonly instance: rds.DatabaseInstance;
  public readonly credentials: rds.Credentials;

  constructor(scope: Construct, id: string, props: DatabaseServerProps) {
    super(scope, id);

    this.credentials = rds.Credentials.fromGeneratedSecret("admin");

    this.instance = new rds.DatabaseInstance(this, "Instance", {
      engine: rds.DatabaseInstanceEngine.mysql({
        version: rds.MysqlEngineVersion.VER_8_0_35,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.BURSTABLE2,
        ec2.InstanceSize.MICRO
      ),
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      credentials: this.credentials,
      databaseName: "atte",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
  }
}
