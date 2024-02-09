import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as assets from "aws-cdk-lib/aws-s3-assets";
import { Construct } from "constructs";
import path = require("path");

export interface AtteServerProps {
  vpc: ec2.IVpc;
}

export interface UserDataProps {
  atteVersion: string;
  atteArchive: assets.Asset;
  nginxConfig: assets.Asset;
  appHost: string;
  dbHost: string;
  dbSecretId: string;
}

export class AtteServer extends Construct {
  public readonly instance: ec2.Instance;

  constructor(scope: Construct, id: string, props: AtteServerProps) {
    super(scope, id);

    const securityGroup = this.createSecurityGroup(props.vpc);

    const keyPair = new ec2.KeyPair(this, "KeyPair", {
      type: ec2.KeyPairType.ED25519,
      format: ec2.KeyPairFormat.PEM,
    });

    this.instance = this.createInstance(props.vpc, securityGroup, keyPair);
  }

  public addUserData(props: UserDataProps) {
    const userData = this.instance.userData;

    const nginxConfigPath = userData.addS3DownloadCommand({
      bucket: props.nginxConfig.bucket,
      bucketKey: props.nginxConfig.s3ObjectKey,
    });

    const archivePath = userData.addS3DownloadCommand({
      bucket: props.atteArchive.bucket,
      bucketKey: props.atteArchive.s3ObjectKey,
    });

    userData.addCommands(
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

  private createInstance(
    vpc: ec2.IVpc,
    securityGroup: ec2.SecurityGroup,
    keyPair: ec2.KeyPair
  ): ec2.Instance {
    return new ec2.Instance(this, "Instance", {
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: new ec2.AmazonLinuxImage({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2023,
        cpuType: ec2.AmazonLinuxCpuType.X86_64,
      }),
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      securityGroup,
      keyPair,
      ssmSessionPermissions: true,
    });
  }
}
