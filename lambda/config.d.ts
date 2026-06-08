export declare const enum SpamFilterOption {
    NONE = 0,
    DEFAULT = 1,
    CUSTOM = 2
}
export declare const config: {
    project: string;
    domain: string;
    recipient: string;
    headerValue: string;
    emailKeyPrefix: string;
    subjectPrefix: string;
    allowPlusSign: boolean;
    spamFilter: SpamFilterOption;
    subjectFilterKeywords: string[];
    blockedRecipients: string[];
    blockedSenders: string[];
    blockedSenderDomains: string[];
    bulkMailHeaders: string[];
    brandKeywords: string[];
    trustedBrandDomains: string[];
    verifiedAliases: string[];
    forwardMapping: {
        [key: string]: string[];
    };
};
