import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as assets from "aws-cdk-lib/aws-s3-assets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as path from "path";
import { Construct } from "constructs";

export interface AtteServerProps {
  vpc: ec2.IVpc;
  archive: assets.Asset;
}

export class AtteServer extends Construct {
  public readonly instance: ec2.Instance;

  constructor(scope: Construct, id: string, props: AtteServerProps) {
    super(scope, id);

    const role = new iam.Role(this, "Role", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
    });
    role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore")
    );

    const securityGroup = new ec2.SecurityGroup(this, "SecurityGroup", {
      vpc: props.vpc,
      allowAllOutbound: true,
    });
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      "Allow SSH from anywhere"
    );
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      "Allow HTTP from anywhere"
    );

    const keyPair = new ec2.KeyPair(this, "KeyPair", {
      type: ec2.KeyPairType.ED25519,
      format: ec2.KeyPairFormat.PEM,
    });

    const nginxConfig = new assets.Asset(this, "NginxConfig", {
      path: path.join(__dirname, "../assets/nginx.conf"),
    });
    const userData = ec2.UserData.forLinux();
    this.addS3DownloadCommand(userData, nginxConfig, props.archive);

    this.instance = new ec2.Instance(this, "Instance", {
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: new ec2.AmazonLinuxImage({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2023,
        cpuType: ec2.AmazonLinuxCpuType.X86_64,
      }),
      vpc: props.vpc,
      role,
      securityGroup,
      keyPair,
      userData,
    });
  }

  private addS3DownloadCommand(
    userData: ec2.UserData,
    nginxConfig: assets.Asset,
    archive: assets.Asset
  ) {
    const nginxConfigPath = userData.addS3DownloadCommand({
      bucket: nginxConfig.bucket,
      bucketKey: nginxConfig.s3ObjectKey,
    });

    const archivePath = userData.addS3DownloadCommand({
      bucket: archive.bucket,
      bucketKey: archive.s3ObjectKey,
    });

    userData.addCommands(
      "dnf update -y",
      "dnf install -y unzip",
      "dnf install -y nginx",
      `cp ${nginxConfigPath} /etc/nginx/nginx.conf`,
      "systemctl start nginx",
      "systemctl enable nginx",

      "dnf install -y php8.2 php8.2-zip",
      'sed -i "s/user = apache/user = nginx/" /etc/php-fpm.d/www.conf',
      'sed -i "s/group = apache/group = nginx/" /etc/php-fpm.d/www.conf',
      "php -r \"copy('https://getcomposer.org/installer', 'composer-setup.php');\"",
      "php /composer-setup.php --install-dir=/usr/local/bin --filename=composer",
      "systemctl start php-fpm",
      "systemctl enable php-fpm",

      "mkdir -p /var/www",
      `unzip ${archivePath} -d /var/www`,
      "mv /var/www/atte-1.3.1 /var/www/atte",
      "cd /var/www/atte",
      "cp .env.example .env",
      'sed -i "s/APP_ENV=local/APP_ENV=staging/" .env',
      'sed -i "s/APP_DEBUG=true/APP_DEBUG=false/" .env',
      'sed -i "s/APP_URL=http:\\/\\/localhost/APP_URL=http:\\/\\/$(curl inet-ip.info\\/ip)/" .env',
      "composer install --prefer-dist --no-progress --no-suggest",
      "php artisan key:generate",
      // "php artisan migrate --seed",
      "chown -R nginx:nginx /var/www/atte"
    );

    return userData;
  }
}
