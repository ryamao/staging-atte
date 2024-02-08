import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as assets from "aws-cdk-lib/aws-s3-assets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as path from "path";
import { Construct } from "constructs";

export interface AtteServerProps {
  vpc: ec2.IVpc;
  archive: assets.Asset;
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

    const userData = this.createUserData(props);

    this.instance = this.createInstance(
      props.vpc,
      securityGroup,
      keyPair,
      userData
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
    sg.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      "Allow HTTP from anywhere"
    );

    return sg;
  }

  private createUserData(props: AtteServerProps): ec2.UserData {
    const userData = ec2.UserData.forLinux();

    const nginxConfig = new assets.Asset(this, "NginxConfig", {
      path: path.join(__dirname, "../assets/nginx.conf"),
    });
    const nginxConfigPath = userData.addS3DownloadCommand({
      bucket: nginxConfig.bucket,
      bucketKey: nginxConfig.s3ObjectKey,
    });

    const archivePath = userData.addS3DownloadCommand({
      bucket: props.archive.bucket,
      bucketKey: props.archive.s3ObjectKey,
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
      "mv /var/www/atte-1.3.1 /var/www/atte",
      "cd /var/www/atte",

      "cp .env.example .env",
      'sed -i "s/^APP_ENV=.*$/APP_ENV=staging/" .env',
      'sed -i "s/^APP_DEBUG=.*$/APP_DEBUG=false/" .env',
      'sed -i "s/^APP_URL=.*$/APP_URL=http:\\/\\/$(curl inet-ip.info\\/ip)/" .env',
      `sed -i "s/^DB_HOST=.*$/DB_HOST=${props.dbHost}/" .env`,
      `sed -i "s/^DB_USERNAME=.*$/DB_USERNAME=$(aws secretsmanager get-secret-value --secret-id ${props.dbSecretId} --query SecretString | jq -r . | jq -r .username)/" .env`,
      `sed -i "s/^DB_PASSWORD=.*$/DB_PASSWORD=$(aws secretsmanager get-secret-value --secret-id ${props.dbSecretId} --query SecretString | jq -r . | jq -r .password)/" .env`,
      'sed -i "s/^MAIL_MAILER=.*$/MAIL_MAILER=log/" .env',
      "echo 'AWS_DEFAULT_REGION=ap-northeast-1' >> .env",

      "composer install --prefer-dist --no-progress --no-suggest",
      "php artisan key:generate",
      "php artisan migrate --seed",

      "chown -R nginx:nginx /var/www/atte"
    );

    return userData;
  }

  private createInstance(
    vpc: ec2.IVpc,
    securityGroup: ec2.SecurityGroup,
    keyPair: ec2.KeyPair,
    userData: ec2.UserData
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
      userData,
      ssmSessionPermissions: true,
    });
  }
}
