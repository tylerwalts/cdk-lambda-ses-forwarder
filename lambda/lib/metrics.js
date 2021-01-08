var AWS = require("aws-sdk");
var config = require("./config.js");
AWS.config.update({region: process.env.AWS_REGION});

const NAMESPACE_ROOT = `${config.config.project}/SESForwarder`;

/**
 * emitMetric to CloudWatch
 */
function emitMetric(metricName, dimensions= [], namespace = NAMESPACE_ROOT) {

  const cloudwatch = new AWS.CloudWatch({
     apiVersion: '2010-08-01',
     region: process.env.AWS_REGION
  });

  const params = {
    MetricData: [
      {
        MetricName: metricName,
        Dimensions: dimensions,
        //Unit: 'None',
        Unit: 'Count',
        Value: 1.0
      },
    ],
    Namespace: namespace
  };
  console.log('Params', params);

  cloudwatch.putMetricData(params, function(err, data) {
    console.log('IN CALLBACK');
    if (err) {
      console.log("CW Error", err);
    } else {
      console.log("CW Success", JSON.stringify(data));
    }
  });

  return true;
}

/**
 * emitSpamMetric to CloudWatch using consistent namespace.
 * Type is the type of spam reason, usually per filter type.
 * Term is the specific term of this type that triggered the spam flag.
 */
function emitSpamMetric(type, term) {
  const dimensions = [
    {
      Name: 'Type',
      Value: type
    },
  ];

  return emitMetric(term, dimensions, `${NAMESPACE_ROOT}/Spam`);
}

/**
 * emitResultMetric to CloudWatch using consistent namespace.
 * Result Examples: Success, Error, Spam, Other...
 */
function emitResultMetric(result) {
  const dimensions = [];
  return emitMetric(result, dimensions, `${NAMESPACE_ROOT}/Result`);
}


module.exports = {
  emitMetric,
  emitSpamMetric,
  emitResultMetric
};

