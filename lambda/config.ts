import * as path from 'path';
import * as fs from 'fs';

export const enum SpamFilterOption {
  NONE,
  DEFAULT,
  CUSTOM
}

const configDir = path.join(__dirname, 'config');

function loadList(filename: string): string[] {
  const filepath = path.join(configDir, filename);
  return fs.readFileSync(filepath, 'utf8')
    .split('\n')
    .map((line: string) => line.trim())
    .filter((line: string) => line.length > 0 && !line.startsWith('#'));
}

export const config = {
  project: "TylerWalts",
  domain: "tylerwalts.com",
  recipient: "catch-all@tylerwalts.com",
  headerValue: "forwarded",
  emailKeyPrefix: "emails/",
  subjectPrefix: "[tyler] ",
  allowPlusSign: true,
  spamFilter: SpamFilterOption.CUSTOM,

  subjectFilterKeywords: loadList('subjectFilterKeywords.txt'),
  blockedRecipients: loadList('blockedRecipients.txt'),
  blockedSenders: loadList('blockedSenders.txt'),
  blockedSenderDomains: loadList('blockedSenderDomains.txt'),
  bulkMailHeaders: loadList('bulkMailHeaders.txt'),
  brandKeywords: loadList('brandKeywords.txt'),
  trustedBrandDomains: loadList('trustedBrandDomains.txt'),

  forwardMapping: {
    "@tylerwalts.com": ["tylerwalts@gmail.com"],
  } as { [key: string]: string[] }
};
