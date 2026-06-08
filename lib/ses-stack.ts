import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as ses from "aws-cdk-lib/aws-ses";
import * as actions from "aws-cdk-lib/aws-ses-actions";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as path from "path";
import { Construct } from "constructs";

import { SpamFilterOption, config } from "../lambda/config";

export class SesStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, `${config.project}SESBucketNew`, {
        lifecycleRules: [
          {
            transitions: [
                {
                    storageClass: s3.StorageClass.INFREQUENT_ACCESS,
                    transitionAfter: cdk.Duration.days(30),
                },
                {
                    storageClass: s3.StorageClass.GLACIER,
                    transitionAfter: cdk.Duration.days(90),
                },
            ],
          },
        ],
    });

    const forwarderLambda = new lambda.Function(this, `${config.project}SESForwarder_New`, {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "handler.handler",
      functionName: `${config.project}SESForwarder_New`,
      code: lambda.Code.fromAsset(path.join(__dirname, "../lambda")),
      environment: {
        BUCKETNAME: bucket.bucketName
      },
      timeout: cdk.Duration.seconds(10),
      memorySize: 128
    });

    const lambdaRole = forwarderLambda.role as iam.Role;

    const policy = new iam.Policy(this, `${config.project}SESPolicy`);

    const policyStatementLog = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: ["arn:aws:logs:*:*:*"],
      actions: [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ]
    });
    const policyStatementSes = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: ["*"],
      actions: ["ses:SendRawEmail"]
    });
    const policyStatementS3 = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: [`${bucket.bucketArn}/*`],
      actions: ["s3:GetObject", "s3:PutObject"]
    });
    policy.addStatements(
      policyStatementLog,
      policyStatementS3,
      policyStatementSes
    );
    lambdaRole.attachInlinePolicy(policy);

    if (config.spamFilter == SpamFilterOption.NONE) console.warn("Warning: you are not using any spam filter!");
    const ruleSetProperties = {
      dropSpam: config.spamFilter == SpamFilterOption.DEFAULT ? true : false,
      rules: [
        {
          enabled: true,
          recipients: [ `.${config.domain}`, config.domain ],
          actions: [
            new actions.AddHeader({
              name: "X-Special-Header",
              value: config.headerValue
            }),
            new actions.S3({
              bucket,
              objectKeyPrefix: config.emailKeyPrefix
            }),
            new actions.Lambda({
              function: forwarderLambda
            }),
            new actions.Stop({})
          ]
        }
      ]
    };

    new ses.ReceiptRuleSet(this, `${config.project}RuleSet`, ruleSetProperties);


    /* Define a CloudWatch Metrics Dashboard */

    // Total Incoming
    let totalIncomingWidget = new cloudwatch.SingleValueWidget({
        title: 'Total Incoming',
        width: 6,
        height: 3,
        setPeriodToTimeRange: true,
        metrics: [new cloudwatch.Metric({
            namespace: "AWS/Lambda",
            metricName: 'Invocations',
            dimensionsMap: {
                FunctionName: forwarderLambda.functionName
            },
            statistic: 'Sum'
        })]
    });

    // Total Dropped
    let totalDroppedWidget = new cloudwatch.SingleValueWidget({
        title: 'Total Dropped',
        width: 6,
        height: 3,
        setPeriodToTimeRange: true,
        metrics: [new cloudwatch.Metric({
            namespace: `${config.project}/SESForwarder/Result`,
            metricName: 'Spam',
            statistic: 'Sum'
        })]
    });

    // Total Errors
    let totalErrorsWidget = new cloudwatch.SingleValueWidget({
        title: 'Total Errors',
        width: 6,
        height: 3,
        setPeriodToTimeRange: true,
        metrics: [new cloudwatch.Metric({
            namespace: `${config.project}/SESForwarder/Result`,
            metricName: 'Error',
            statistic: 'Sum'
        })]
    });

    // Total Forwarded
    let totalForwardedWidget = new cloudwatch.SingleValueWidget({
        title: 'Total Forwarded',
        width: 6,
        height: 3,
        setPeriodToTimeRange: true,
        metrics: [new cloudwatch.Metric({
            namespace: `${config.project}/SESForwarder/Result`,
            metricName: 'Success',
            statistic: 'Sum'
        })]
    });

    // Lambda Invocations and Duration
    const executionsWidget = new cloudwatch.GraphWidget({
        title: 'Forwarder Executions',
        width: 12,
        height: 3,
        left: [new cloudwatch.Metric({
            namespace: 'AWS/Lambda',
            metricName: 'Invocations',
            dimensionsMap: {
                FunctionName: forwarderLambda.functionName
            },
            statistic: 'Sum'
        })],
        right: [new cloudwatch.Metric({
            namespace: 'AWS/Lambda',
            metricName: 'Duration',
            dimensionsMap: {
                FunctionName: forwarderLambda.functionName
            },
            statistic: 'Sum'
        })],
        rightYAxis: {
            label: "Latency"
        },
    });

    // Results
    let resultWidget = new cloudwatch.GraphWidget({
        title: 'Forwarder Results',
        width: 12,
        height: 3,
        stacked: true,
        left: [new cloudwatch.Metric({
            namespace: `${config.project}/SESForwarder/Result`,
            metricName: 'Error',
            statistic: 'Sum'
        }),
        new cloudwatch.Metric({
            namespace: `${config.project}/SESForwarder/Result`,
            metricName: 'Spam',
            statistic: 'Sum'
        }),
        new cloudwatch.Metric({
            namespace: `${config.project}/SESForwarder/Result`,
            metricName: 'Success',
            statistic: 'Sum'
        })]
    });

    // Spam Tags
    let spamWidget = new cloudwatch.GraphWidget({
        title: 'Spam Tags by Type',
        width: 12,
        height: 9,
        left: [new cloudwatch.MathExpression({
            expression: `SEARCH('{${config.project}/SESForwarder/Spam,Type}', 'Sum', 300)`,
            usingMetrics: { },
            label: ' '
        })]
    });

    // Results
    let sesWidget = new cloudwatch.GraphWidget({
        title: 'Total Account SES Sends',
        width: 12,
        height: 3,
        stacked: true,
        left: [new cloudwatch.Metric({
            namespace: 'AWS/SES',
            metricName: 'Send',
            statistic: 'Sum'
        })]
    });

    // All incoming emails (right column, tall)
    const allEmailsWidget = new cloudwatch.LogQueryWidget({
        title: 'All Incoming Emails',
        logGroupNames: [forwarderLambda.logGroup.logGroupName],
        queryLines: [
          'fields @timestamp as Time, `from` as From, to as To, subject as Subject, result as Result, s3BodyKey as `S3 Body Key`',
          'filter event = "email_processed"',
          'sort @timestamp desc',
          'limit 50'
        ],
        width: 12,
        height: 18
    });

    // Allowed emails (left column, top)
    const allowedLogWidget = new cloudwatch.LogQueryWidget({
        title: 'Allowed Emails',
        logGroupNames: [forwarderLambda.logGroup.logGroupName],
        queryLines: [
          'fields @timestamp as Time, `from` as From, to as To, subject as Subject, s3BodyKey as `S3 Body Key`',
          'filter event = "email_processed" and result = "success"',
          'sort @timestamp desc',
          'limit 10'
        ],
        width: 12,
        height: 6
    });

    // Spam that was filtered (left column, middle)
    const spamLogWidget = new cloudwatch.LogQueryWidget({
        title: 'Filtered Spam',
        logGroupNames: [forwarderLambda.logGroup.logGroupName],
        queryLines: [
          'fields @timestamp as Time, `from` as From, to as To, subject as Subject, spamReasons as Reasons',
          'filter event = "email_processed" and result = "spam"',
          'sort @timestamp desc',
          'limit 10'
        ],
        width: 12,
        height: 6
    });

    // System errors (left column, bottom)
    const errorLogWidget = new cloudwatch.LogQueryWidget({
        title: 'System Errors',
        logGroupNames: [forwarderLambda.logGroup.logGroupName],
        queryLines: [
          'fields @timestamp as Time, `from` as From, to as To, subject as Subject, error as Error',
          'filter event = "email_processed" and result = "error"',
          'sort @timestamp desc',
          'limit 10'
        ],
        width: 12,
        height: 6
    });

    const emailDashboard = new cloudwatch.Dashboard(this, `${config.project}EmailDashboard_New`, {
      dashboardName: `${config.project}-Email-Dashboard_New`,
      widgets: [
        [
          new cloudwatch.Column(totalIncomingWidget),
          new cloudwatch.Column(totalDroppedWidget),
          new cloudwatch.Column(totalErrorsWidget),
          new cloudwatch.Column(totalForwardedWidget),
        ],
        [
          new cloudwatch.Column(executionsWidget, resultWidget, sesWidget),
          new cloudwatch.Column(spamWidget),
        ],
        [
          new cloudwatch.Column(allowedLogWidget, spamLogWidget, errorLogWidget),
          new cloudwatch.Column(allEmailsWidget),
        ]
      ]
    });

  }
}
