import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as assets from "aws-cdk-lib/aws-s3-assets";
import * as autoscaling from "aws-cdk-lib/aws-autoscaling";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Construct } from "constructs";
import path = require("path");

/** アプリケーションサーバーのプロパティ */
export interface AtteServerProps {
  vpc: ec2.IVpc;
}

/** アプリケーションサーバーの起動スクリプトのプロパティ */
export interface BootScriptProps {
  atteVersion: string;
  atteArchive: assets.Asset;
  nginxConfig: assets.Asset;
  appHost: string;
  dbHost: string;
  dbSecretId: string;
}

/** Atteのアプリケーションサーバー */
export class AtteServer extends Construct {
  private readonly autoScalingGroup: autoscaling.AutoScalingGroup;

  private static SCALING_SCHEDULE = [
    { hour: "1", minute: "0", desiredCapacity: 0 },
    { hour: "6", minute: "0", desiredCapacity: 1 },
    { hour: "8", minute: "30", desiredCapacity: 2 },
    { hour: "9", minute: "30", desiredCapacity: 1 },
    { hour: "12", minute: "0", desiredCapacity: 2 },
    { hour: "13", minute: "0", desiredCapacity: 1 },
    { hour: "17", minute: "30", desiredCapacity: 2 },
    { hour: "18", minute: "30", desiredCapacity: 1 },
  ];

  constructor(scope: Construct, id: string, props: AtteServerProps) {
    super(scope, id);

    const securityGroup = this.createSecurityGroup(props.vpc);

    const keyPair = new ec2.KeyPair(this, "KeyPair", {
      type: ec2.KeyPairType.ED25519,
      format: ec2.KeyPairFormat.PEM,
    });

    this.autoScalingGroup = this.createAutoScalingGroup(
      props.vpc,
      securityGroup,
      keyPair
    );

    AtteServer.SCALING_SCHEDULE.forEach((schedule) => {
      this.autoScalingGroup.scaleOnSchedule(`ScaleDownAt${schedule.hour}`, {
        schedule: autoscaling.Schedule.cron(schedule),
        timeZone: "Asia/Tokyo",
        desiredCapacity: schedule.desiredCapacity,
      });
    });
  }

  /** アプリケーションサーバーのIAMロール */
  public get role(): iam.IRole {
    return this.autoScalingGroup.role;
  }

  /** アプリケーションサーバーのネットワークコネクション */
  public get connections(): ec2.Connections {
    return this.autoScalingGroup.connections;
  }

  /** アプリケーションサーバーのユーザーデータ */
  public get userData(): ec2.UserData {
    return this.autoScalingGroup.userData;
  }

  /** アプリケーションサーバーをロードバランサーのターゲットとして使用する */
  public asLoadBalancerTarget(): elbv2.IApplicationLoadBalancerTarget {
    return this.autoScalingGroup;
  }

  /** アプリケーションサーバーのユーザーデータに起動スクリプトを追加する */
  public addBootScript(props: BootScriptProps) {
    const nginxConfigPath = this.userData.addS3DownloadCommand({
      bucket: props.nginxConfig.bucket,
      bucketKey: props.nginxConfig.s3ObjectKey,
    });

    const archivePath = this.userData.addS3DownloadCommand({
      bucket: props.atteArchive.bucket,
      bucketKey: props.atteArchive.s3ObjectKey,
    });

    this.userData.addCommands(
      "dnf update -y",
      "dnf install -y unzip",
      "dnf install -y nginx",
      `cp ${nginxConfigPath} /etc/nginx/nginx.conf`,
      "systemctl start nginx",
      "systemctl enable nginx",

      "dnf install -y php8.2 php8.2-zip php8.2-mysqlnd",
      'sed -i "s/^user = .*$/user = nginx/" /etc/php-fpm.d/www.conf',
      'sed -i "s/^group = .*$/group = nginx/" /etc/php-fpm.d/www.conf',
      "export HOME=/root",
      "cd /tmp",
      "php -r \"copy('https://getcomposer.org/installer', 'composer-setup.php');\"",
      "php composer-setup.php --install-dir=/usr/local/bin --filename=composer",
      "systemctl start php-fpm",
      "systemctl enable php-fpm",

      "mkdir -p /var/www",
      `unzip ${archivePath} -d /var/www`,
      `mv /var/www/atte-${props.atteVersion} /var/www/atte`,
      "cd /var/www/atte",

      "cp .env.example .env",
      'sed -i "s/^APP_ENV=.*$/APP_ENV=staging/" .env',
      'sed -i "s/^APP_DEBUG=.*$/APP_DEBUG=false/" .env',
      `sed -i "s/^APP_URL=.*$/APP_URL=http:\\/\\/${props.appHost}/" .env`,
      `sed -i "s/^DB_HOST=.*$/DB_HOST=${props.dbHost}/" .env`,
      `sed -i "s/^DB_USERNAME=.*$/DB_USERNAME=$(aws secretsmanager get-secret-value --secret-id ${props.dbSecretId} --query SecretString | jq -r . | jq -r .username)/" .env`,
      `sed -i "s/^DB_PASSWORD=.*$/DB_PASSWORD=$(aws secretsmanager get-secret-value --secret-id ${props.dbSecretId} --query SecretString | jq -r . | jq -r .password)/" .env`,
      'sed -i "s/^MAIL_MAILER=.*$/MAIL_MAILER=log/" .env',
      'sed -i "s/^AWS_DEFAULT_REGION=.*$/AWS_DEFAULT_REGION=ap-northeast-1/" .env',

      "composer install --prefer-dist --no-progress --no-suggest",
      "php artisan key:generate",
      "php artisan migrate --seed",

      "chown -R nginx:nginx /var/www/atte"
    );
  }

  /** セキュリティグループを作成する */
  private createSecurityGroup(vpc: ec2.IVpc): ec2.SecurityGroup {
    const sg = new ec2.SecurityGroup(this, "SecurityGroup", {
      vpc,
      allowAllOutbound: true,
    });

    sg.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      "Allow SSH from anywhere"
    );

    return sg;
  }

  /** オートスケーリンググループを作成する */
  private createAutoScalingGroup(
    vpc: ec2.IVpc,
    securityGroup: ec2.SecurityGroup,
    keyPair: ec2.KeyPair
  ): autoscaling.AutoScalingGroup {
    const launchTemplate = new ec2.LaunchTemplate(this, "LaunchTemplate", {
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: new ec2.AmazonLinuxImage({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2023,
        cpuType: ec2.AmazonLinuxCpuType.X86_64,
      }),
      role: new iam.Role(this, "Role", {
        assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      }),
      securityGroup,
      keyPair,
      associatePublicIpAddress: true,
    });

    return new autoscaling.AutoScalingGroup(this, "AutoScalingGroup", {
      launchTemplate,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      minCapacity: 0,
      maxCapacity: 2,
      ssmSessionPermissions: true,
      healthCheck: autoscaling.HealthCheck.elb({
        grace: cdk.Duration.seconds(300),
      }),
    });
  }
}
