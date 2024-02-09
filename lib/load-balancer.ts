import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Construct } from "constructs";

export interface LoadBalancerProps {
  vpc: ec2.IVpc;
  target: elbv2.IApplicationLoadBalancerTarget;
}

export class LoadBalancer extends Construct {
  private readonly alb: elbv2.ApplicationLoadBalancer;

  constructor(scope: Construct, id: string, props: LoadBalancerProps) {
    super(scope, id);

    const securityGroup = this.createSecurityGroup(props.vpc);

    this.alb = new elbv2.ApplicationLoadBalancer(this, "ALB", {
      vpc: props.vpc,
      securityGroup,
      internetFacing: true,
    });

    const listener = this.alb.addListener("Listener", {
      port: 80,
      open: true,
    });

    listener.addTargets("Target", {
      port: 80,
      targets: [props.target],
    });
  }

  public get connections(): ec2.Connections {
    return this.alb.connections;
  }

  public get dnsName(): string {
    return this.alb.loadBalancerDnsName;
  }

  private createSecurityGroup(vpc: ec2.IVpc): ec2.SecurityGroup {
    const sg = new ec2.SecurityGroup(this, "SecurityGroup", {
      vpc,
      allowAllOutbound: true,
    });
    sg.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      "Allow HTTP from anywhere"
    );
    sg.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      "Allow HTTPS from anywhere"
    );
    sg.addIngressRule(
      ec2.Peer.anyIpv6(),
      ec2.Port.tcp(80),
      "Allow HTTP from anywhere"
    );
    sg.addIngressRule(
      ec2.Peer.anyIpv6(),
      ec2.Port.tcp(443),
      "Allow HTTPS from anywhere"
    );
    return sg;
  }
}
