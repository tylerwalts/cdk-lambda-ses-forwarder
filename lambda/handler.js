"use strict";

var AWS = require("aws-sdk");
var config = require("./config.js");
const { filterSpam, spamKey } = require("./lib/filterSpam.js");
var { emitResultMetric } = require("./lib/metrics.js");

var defaultConfig = {
  fromEmail: config.config.recipient,
  subjectPrefix: config.config.subjectPrefix,
  emailBucket: process.env.BUCKETNAME,
  emailKeyPrefix: config.config.emailKeyPrefix,
  allowPlusSign: config.config.allowPlusSign,
  forwardMapping: config.config.forwardMapping
};

exports.parseEvent = function(data) {
  if (
    !data.event ||
    !data.event.hasOwnProperty("Records") ||
    data.event.Records.length !== 1 ||
    !data.event.Records[0].hasOwnProperty("eventSource") ||
    data.event.Records[0].eventSource !== "aws:ses" ||
    data.event.Records[0].eventVersion !== "1.0"
  ) {
    data.log({
      message: "parseEvent() received invalid SES message:",
      level: "error",
      event: JSON.stringify(data.event)
    });
    return Promise.reject(new Error("Error: Received invalid SES message."));
  }

  data.email = data.event.Records[0].ses.mail;
  data.recipients = data.event.Records[0].ses.receipt.recipients;
  return Promise.resolve(data);
};

exports.transformRecipients = function(data) {
  var newRecipients = [];
  data.originalRecipients = data.recipients;
  data.recipients.forEach(function(origEmail) {
    var origEmailKey = origEmail.toLowerCase();
    if (data.config.allowPlusSign) {
      origEmailKey = origEmailKey.replace(/\+.*?@/, "@");
    }
    if (data.config.forwardMapping.hasOwnProperty(origEmailKey)) {
      newRecipients = newRecipients.concat(
        data.config.forwardMapping[origEmailKey]
      );
      data.originalRecipient = origEmail;
    } else {
      var origEmailDomain;
      var origEmailUser;
      var pos = origEmailKey.lastIndexOf("@");
      if (pos === -1) {
        origEmailUser = origEmailKey;
      } else {
        origEmailDomain = origEmailKey.slice(pos);
        origEmailUser = origEmailKey.slice(0, pos);
      }
      if (
        origEmailDomain &&
        data.config.forwardMapping.hasOwnProperty(origEmailDomain)
      ) {
        newRecipients = newRecipients.concat(
          data.config.forwardMapping[origEmailDomain]
        );
        data.originalRecipient = origEmail;
      } else if (
        origEmailUser &&
        data.config.forwardMapping.hasOwnProperty(origEmailUser)
      ) {
        newRecipients = newRecipients.concat(
          data.config.forwardMapping[origEmailUser]
        );
        data.originalRecipient = origEmail;
      } else if (data.config.forwardMapping.hasOwnProperty("@")) {
        newRecipients = newRecipients.concat(data.config.forwardMapping["@"]);
        data.originalRecipient = origEmail;
      }
    }
  });

  if (!newRecipients.length) {
    data.log({
      message: "No new recipients found for: " + data.originalRecipients.join(", "),
      level: "info"
    });
    return data.callback();
  }

  data.recipients = newRecipients;
  return Promise.resolve(data);
};

exports.fetchMessage = function(data) {
  return new Promise(function(resolve, reject) {
    data.s3.copyObject(
      {
        Bucket: data.config.emailBucket,
        CopySource:
          data.config.emailBucket +
          "/" +
          data.config.emailKeyPrefix +
          data.email.messageId,
        Key: data.config.emailKeyPrefix + data.email.messageId,
        ACL: "private",
        ContentType: "text/plain",
        StorageClass: "STANDARD"
      },
      function(err) {
        if (err) {
          data.log({
            level: "error",
            message: "copyObject() returned error:",
            error: err,
            stack: err.stack
          });
          return reject(
            new Error("Error: Could not make readable copy of email.")
          );
        }

        data.s3.getObject(
          {
            Bucket: data.config.emailBucket,
            Key: data.config.emailKeyPrefix + data.email.messageId
          },
          function(err, result) {
            if (err) {
              data.log({
                level: "error",
                message: "getObject() returned error:",
                error: err,
                stack: err.stack
              });
              return reject(
                new Error("Error: Failed to load message body from S3.")
              );
            }
            data.emailData = result.Body.toString();
            return resolve(data);
          }
        );
      }
    );
  });
};

exports.processMessage = function(data) {
  var match = data.emailData.match(/^((?:.+\r?\n)*)(\r?\n(?:.*\s+)*)/m);
  var header = match && match[1] ? match[1] : data.emailData;
  var body = match && match[2] ? match[2] : "";

  if (!/^reply-to:[\t ]?/im.test(header)) {
    match = header.match(/^from:[\t ]?(.*(?:\r?\n\s+.*)*\r?\n)/im);
    var from = match && match[1] ? match[1] : "";
    if (from) {
      header = header + "Reply-To: " + from;
    }
  }

  header = header.replace(/^from:[\t ]?(.*(?:\r?\n\s+.*)*)/gim, function(
    match,
    from
  ) {
    var fromText;
    if (data.config.fromEmail) {
      fromText =
        "From: " +
        from.replace(/<(.*)>/, "").trim() +
        " <" +
        data.config.fromEmail +
        ">";
    } else {
      fromText =
        "From: " +
        from.replace("<", "at ").replace(">", "") +
        " <" +
        data.originalRecipient +
        ">";
    }
    return fromText;
  });

  if (data.config.subjectPrefix) {
    header = header.replace(/^subject:[\t ]?(.*)/gim, function(match, subject) {
      return "Subject: " + data.config.subjectPrefix + subject;
    });
  }

  if (data.config.toEmail) {
    header = header.replace(
      /^to:[\t ]?(.*)/gim,
      () => "To: " + data.config.toEmail
    );
  }

  header = header.replace(/^return-path:[\t ]?(.*)\r?\n/gim, "");
  header = header.replace(/^sender:[\t ]?(.*)\r?\n/gim, "");
  header = header.replace(/^message-id:[\t ]?(.*)\r?\n/gim, "");
  header = header.replace(/^dkim-signature:[\t ]?.*\r?\n(\s+.*\r?\n)*/gim, "");

  data.emailData = header + body;
  return Promise.resolve(data);
};

exports.sendMessage = function(data) {
  var params = {
    Destinations: data.recipients,
    Source: data.originalRecipient,
    RawMessage: {
      Data: data.emailData
    }
  };
  return new Promise(function(resolve, reject) {
    data.ses.sendRawEmail(params, function(err, result) {
      if (err) {
        data.log({
          level: "error",
          message: "sendRawEmail() returned error.",
          error: err,
          stack: err.stack
        });
        return reject(new Error("Error: Email sending failed."));
      }
      resolve(data);
    });
  });
};

exports.filterSpam = filterSpam;

/**
 * Emits a single structured JSON log summarizing the email processing result.
 */
function emitSummaryLog(data, result, error) {
  const ses = data.event.Records[0].ses;
  const mail = ses.mail;
  const source = mail.source || '';

  const emailKeyPrefix = (data.config && data.config.emailKeyPrefix) || '';
  const summary = {
    event: "email_processed",
    from: (mail.commonHeaders && mail.commonHeaders.from && mail.commonHeaders.from[0]) || source,
    to: (mail.destination && mail.destination[0]) || '',
    subject: (mail.commonHeaders && mail.commonHeaders.subject) || '',
    source: source,
    sourceDomain: source.split('@').pop() || '',
    messageId: mail.messageId || '',
    s3BodyKey: emailKeyPrefix + (mail.messageId || ''),
    result: result,
    spamReasons: (data.spamReasons || []).map(r => `${r.type}:${r.term}`).join(', '),
    forwarded: result === 'success',
  };

  if (result === 'success') {
    summary.forwardedTo = data.recipients || [];
  }

  if (data.bulkHeaders && data.bulkHeaders.length > 0) {
    summary.bulkHeadersDetected = data.bulkHeaders;
  }

  if (result === 'error' && error) {
    summary.error = error.message;
  }

  console.log(JSON.stringify(summary));
}

exports.handler = function(event, context, callback, overrides) {
  var steps =
    overrides && overrides.steps
      ? overrides.steps
      : [
          exports.parseEvent,
          exports.filterSpam,
          exports.transformRecipients,
          exports.fetchMessage,
          exports.processMessage,
          exports.sendMessage
        ];
  var data = {
    event: event,
    callback: callback,
    context: context,
    config: overrides && overrides.config ? overrides.config : defaultConfig,
    log: overrides && overrides.log ? overrides.log : console.log,
    ses: overrides && overrides.ses ? overrides.ses : new AWS.SES(),
    s3:
      overrides && overrides.s3
        ? overrides.s3
        : new AWS.S3({ signatureVersion: "v4" })
  };
  Promise.series(steps, data)
    .then(function(data) {
      emitResultMetric("Success");
      emitSummaryLog(data, "success");
      return data.callback();
    })
    .catch(function(err) {
      if (err.message === `${spamKey}`) {
        emitResultMetric("Spam");
        emitSummaryLog(data, "spam");
        return data.callback();
      } else {
        emitResultMetric("Error");
        emitSummaryLog(data, "error", err);
        return data.callback();
      }
    });
};

Promise.series = function(promises, initValue) {
  return promises.reduce(function(chain, promise) {
    if (typeof promise !== "function") {
      return Promise.reject(
        new Error("Error: Invalid promise item: " + promise)
      );
    }
    return chain.then(promise);
  }, Promise.resolve(initValue));
};
