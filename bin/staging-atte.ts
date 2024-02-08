#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { StagingAtteStack } from "../lib/staging-atte-stack";

const app = new cdk.App();
new StagingAtteStack(app, "StagingAtteStack");
