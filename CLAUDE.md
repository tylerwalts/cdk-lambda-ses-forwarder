# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CDK project that deploys an AWS Lambda-based SES email forwarder. Based on [aws-lambda-ses-forwarder](https://github.com/arithmetric/aws-lambda-ses-forwarder), wrapped in CDK infrastructure.

## Commands

- `yarn` — install dependencies
- `yarn build` — compile TypeScript (`tsc`)
- `yarn test` — run tests (`jest`)
- `npx cdk synth` — synthesize CloudFormation template
- `npx cdk deploy --require-approval never` — deploy to AWS

## Architecture

Two layers with different languages:

**CDK Infrastructure (TypeScript):** `lib/ses-stack.ts` defines the full stack — S3 bucket with lifecycle rules, Lambda function, IAM policies, SES receipt rule set, and a CloudWatch dashboard. The CDK app entry point is `bin/ses.ts`.

**Lambda Runtime (plain JavaScript):** `lambda/handler.js` processes inbound SES emails through a sequential promise chain: parse SES event → filter spam → transform recipients → fetch raw email from S3 → rewrite headers (From, Reply-To, Subject, strip DKIM) → send via SES `sendRawEmail`.

**Configuration:** `lambda/config.js` (gitignored, created from `config.example.js`) drives both layers — the CDK stack reads it for resource naming/domain setup, and the Lambda reads it at runtime for forwarding rules. The config type is declared in `lambda/config.d.ts`.

**Spam filtering** (`lambda/lib/filterSpam.js`): Three filters run when `spamFilter=2` (Custom) — SES receipt verdicts, subject keyword matching, and blocked recipient list.

**Metrics** (`lambda/lib/metrics.js`): Uses CloudWatch Embedded Metric Format (EMF) via structured `console.log` — no CloudWatch SDK calls needed from Lambda. Emits under `{project}/SESForwarder/Result` and `{project}/SESForwarder/Spam` namespaces.

## Key Details

- Uses AWS CDK v1 (1.44.0) — imports are per-package (`@aws-cdk/aws-lambda`, not `aws-cdk-lib`)
- Lambda is Node.js 12.x runtime, plain JS (not transpiled from TS)
- S3 bucket name is passed to Lambda via `BUCKETNAME` environment variable
- SES rule set must be manually activated in the AWS console after deploy
- The test in `test/ses.test.ts` is a snapshot-style CDK assertion (currently expects empty resources — will fail against real stack)
