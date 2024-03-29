import * as cdk from "aws-cdk-lib";
import * as assets from "aws-cdk-lib/aws-s3-assets";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as path from "path";
import { Construct } from "constructs";
import { AtteServer } from "./atte-server";
import { DatabaseServer } from "./database-server";
import { LoadBalancer } from "./load-balancer";

/**
 * Atteのステージング環境を構築するスタック
 */
export class StagingAtteStack extends cdk.Stack {
  /** デプロイで使用するアーカイブのバージョン */
  static readonly ATTE_VERSION = "1.3.2";

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const archive = new assets.Asset(this, "AtteArchive", {
      path: path.join(
        __dirname,
        `../assets/atte-${StagingAtteStack.ATTE_VERSION}.zip`
      ),
    });

    const nginxConfig = new assets.Asset(this, "NginxConfig", {
      path: path.join(__dirname, "../assets/nginx.conf"),
    });

    const vpc = this.createVpc();

    const dbServer = new DatabaseServer(this, "Database", {
      vpc,
    });

    const atteServer = new AtteServer(this, "Ec2Instance", { vpc });

    const loadBalancer = new LoadBalancer(this, "LoadBalancer", {
      vpc,
      target: atteServer.asLoadBalancerTarget(),
    });

    archive.grantRead(atteServer.role);
    nginxConfig.grantRead(atteServer.role);
    dbServer.instance.grantConnect(atteServer.role);
    dbServer.secret?.grantRead(atteServer.role);

    dbServer.connections.allowFrom(atteServer.connections, ec2.Port.tcp(3306));
    atteServer.connections.allowFrom(
      loadBalancer.connections,
      ec2.Port.tcp(80)
    );

    atteServer.addBootScript({
      atteVersion: StagingAtteStack.ATTE_VERSION,
      atteArchive: archive,
      nginxConfig,
      appHost: loadBalancer.dnsName,
      dbHost: dbServer.instance.dbInstanceEndpointAddress,
      dbSecretId: dbServer.secret!.secretArn,
    });

    new cdk.CfnOutput(this, "ApplicationURL", {
      value: `http://${loadBalancer.dnsName}`,
    });
  }

  /** VPCを作成する */
  private createVpc() {
    return new ec2.Vpc(this, "Vpc", {
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
      gatewayEndpoints: {
        S3: {
          service: ec2.GatewayVpcEndpointAwsService.S3,
        },
      },
    });
  }
}
