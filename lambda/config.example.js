// This is an example configuration file.
// Copy it to `config.js` and change the values below.

const path = require('path');
const fs = require('fs');

const configDir = path.join(__dirname, 'config');

function loadList(filename) {
  const filepath = path.join(configDir, filename);
  return fs.readFileSync(filepath, 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'));
}

exports.config = {
  project: "MyProject",
  domain: "example.com",
  recipient: "contact@example.com",
  headerValue: "forwarded",
  emailKeyPrefix: "emails/",
  subjectPrefix: "",
  allowPlusSign: true,
  spamFilter: 2,  // 0 = None, 1 = Default, 2 = Custom

  subjectFilterKeywords: loadList('subjectFilterKeywords.txt'),
  blockedRecipients: loadList('blockedRecipients.txt'),
  blockedSenders: loadList('blockedSenders.txt'),
  blockedSenderDomains: loadList('blockedSenderDomains.txt'),
  bulkMailHeaders: loadList('bulkMailHeaders.txt'),
  brandKeywords: loadList('brandKeywords.txt'),
  trustedBrandDomains: loadList('trustedBrandDomains.txt'),

  forwardMapping: {
    "info@example.com": ["example.john@example.com", "example.jen@example.com"],
    "abuse@example.com": ["example.jim@example.com"],
    "@example.com": ["example.john@example.com"],
    info: ["info@example.com"]
  }
};
