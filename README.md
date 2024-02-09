# 勤怠管理システム「Atte」の AWS 環境構築ツール

## 概要

[Atte](https://github.com/ryamao/atte) はプログラミングスクールの課題で作成した Web ベースの勤怠管理システムです。この CDK アプリケーションは [Atte](https://github.com/ryamao/atte) を AWS 上にデプロイするためのものです。

## システム構成図

![Staging Atte](./doc/Atteシステム構成図.drawio.svg)

## 開発環境

- Node.js 20.10.0
- TypeScript 5.3.3
- AWS CLI 2.15.17
- AWS CDK 2.126.0

## セットアップ

### 事前準備

- AWS アカウントをお持ちでない場合は [AWS アカウントの作成](https://aws.amazon.com/jp/premiumsupport/knowledge-center/create-and-activate-aws-account/) を行ってください。
- [AWS CLI](https://aws.amazon.com/jp/cli/) と [AWS CDK](https://aws.amazon.com/jp/cdk/) のインストールが必要です。
- IAM ロール `AdministratorAccess` がアタッチされたユーザーで AWS CLI にログインしてください。

### リポジトリのクローン

```bash
git clone https://github.com/ryamao/staging-atte
cd staging-atte
```

### パッケージのインストール

```bash
npm install
```

### デプロイ

```shell-session
$ cdk deploy
...
Outputs:
StagingAtteStack.ApplicationURL = http://...
...
```

デプロイが完了すると `Outputs` に `ApplicationURL` が表示されます。ブラウザでアクセスして動作を確認してください。

### 削除

```bash
cdk destroy
```

## ファイル構成

```text
.
├── README.md
├── bin
│   └── staging-atte.ts
├── lib
│   ├── staging-atte-stack.ts
│   ├── atte-server.ts
│   ├── database-server.ts
│   └── load-balancer.ts
└── assets
    ├── atte-x.y.z.zip
    └── nginx.conf
```

## ファイルの説明

- `README.md`: このファイル
- `bin/staging-atte.ts`: CDK アプリケーションのエントリーポイント
- `lib/staging-atte-stack.ts`: CDK スタックの定義
- `lib/atte-server.ts`: Auto Scaling Group
- `lib/database-server.ts`: RDS
- `lib/load-balancer.ts`: Application Load Balancer
- `assets/atte-x.y.z.zip`: Atte のソースコード
- `assets/nginx.conf`: Laravel 用の Nginx 設定ファイル
