import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

export interface DatabaseServerProps {
  vpc: ec2.IVpc;
}

export class DatabaseServer extends Construct {
  private readonly rdsInstance: rds.DatabaseInstance;

  constructor(scope: Construct, id: string, props: DatabaseServerProps) {
    super(scope, id);

    const credentials = rds.Credentials.fromGeneratedSecret("admin");

    this.rdsInstance = new rds.DatabaseInstance(this, "Instance", {
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
      credentials,
      databaseName: "atte",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
  }

  public get instance(): rds.IDatabaseInstance {
    return this.rdsInstance;
  }

  public get connections(): ec2.Connections {
    return this.rdsInstance.connections;
  }

  public get secret(): secretsmanager.ISecret | undefined {
    return this.rdsInstance.secret;
  }
}
