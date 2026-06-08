#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SesStack } from '../lib/ses-stack';
import { config } from "../lambda/config";

const app = new cdk.App();
new SesStack(app, `NewSesForwarder${config.project}`, {
  env: { account: '680397041807', region: 'us-west-2' }
});
