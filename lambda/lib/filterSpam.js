"use strict";

const config = require("../config.js");
const { emitSpamMetric } = require("./metrics.js");

const spamKey = "SPAM";

/**
 * Filters out spam, if custom filter is enabled in config.
 * Returns collected spam reasons on the data object for structured logging.
 */
function filterSpam(data) {
  data.spamReasons = [];

  if (config.config.spamFilter == 2) {
    const sesNotification = data.event.Records[0].ses;

    filterBySESReceiptVerdicts(sesNotification.receipt, data.spamReasons);
    filterBySubjectKeyword(sesNotification.mail.commonHeaders.subject, data.spamReasons);
    filterByTargetRecipient(sesNotification.mail.destination[0], data.spamReasons);
    filterBySender(sesNotification.mail.source, data.spamReasons);
    filterBySenderDomain(sesNotification.mail.source, data.spamReasons);
    warnBulkMailHeaders(sesNotification.mail, data);
    filterByBrandImpersonation(sesNotification.mail.commonHeaders.from[0], sesNotification.mail.source, data.spamReasons);
  }

  if (data.spamReasons.length === 0) {
    return Promise.resolve(data);
  } else {
    for (const reason of data.spamReasons) {
      emitSpamMetric(reason.type, reason.term);
    }
    return Promise.reject(new Error(spamKey));
  }
}


function filterBySESReceiptVerdicts(sesReceipt, reasons) {
  const type = 'SESReceiptVerdict';
  if (sesReceipt.spfVerdict.status === 'FAIL') reasons.push({ type, term: 'SPF' });
  if (sesReceipt.dkimVerdict.status === 'FAIL') reasons.push({ type, term: 'DKIM' });
  if (sesReceipt.spamVerdict.status === 'FAIL') reasons.push({ type, term: 'SpamVerdict' });
  if (sesReceipt.virusVerdict.status === 'FAIL') reasons.push({ type, term: 'VirusVerdict' });
}


function filterBySubjectKeyword(subject, reasons) {
  const type = 'SubjectKeyword';
  for (const keyword of config.config.subjectFilterKeywords) {
    if (subject.toLowerCase().includes(keyword.toLowerCase())) {
      reasons.push({ type, term: keyword });
    }
  }
}


function filterByTargetRecipient(recipientEmail, reasons) {
  const type = 'TargetRecipient';
  for (const recipient of config.config.blockedRecipients) {
    if (recipientEmail === recipient) {
      reasons.push({ type, term: recipient });
    }
  }
}


function filterBySender(source, reasons) {
  const type = 'BlockedSender';
  const senderEmail = source.toLowerCase();
  for (const blocked of config.config.blockedSenders) {
    if (senderEmail === blocked.toLowerCase()) {
      reasons.push({ type, term: blocked });
    }
  }
}


function filterBySenderDomain(source, reasons) {
  const type = 'SenderDomain';
  const senderDomain = source.split('@').pop().toLowerCase();
  for (const domain of config.config.blockedSenderDomains) {
    if (senderDomain === domain.toLowerCase()) {
      reasons.push({ type, term: domain });
    }
  }
}


function warnBulkMailHeaders(mail, data) {
  const headerNames = mail.headers.map(h => h.name.toLowerCase());
  for (const bulkHeader of config.config.bulkMailHeaders) {
    if (headerNames.includes(bulkHeader.toLowerCase())) {
      if (!data.bulkHeaders) data.bulkHeaders = [];
      data.bulkHeaders.push(bulkHeader);
    }
  }
}


function filterByBrandImpersonation(fromHeader, source, reasons) {
  const type = 'BrandImpersonation';
  const senderDomain = source.split('@').pop().toLowerCase();
  const displayName = fromHeader.toLowerCase();

  for (const brand of config.config.brandKeywords) {
    if (displayName.includes(brand.toLowerCase())) {
      const isTrusted = config.config.trustedBrandDomains.some(
        d => senderDomain === d.toLowerCase() || senderDomain.endsWith('.' + d.toLowerCase())
      );
      if (!isTrusted) {
        reasons.push({ type, term: brand });
      }
    }
  }
}


module.exports = {
    filterSpam,
    spamKey
};
