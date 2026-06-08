This is a CDK-ification of [this project](https://github.com/arithmetric/aws-lambda-ses-forwarder)

# Steps

## Initial Deployment

1. [Buy a domain](https://console.aws.amazon.com/route53/home#DomainRegistration:)
1. [Verify your domain in SES](https://console.aws.amazon.com/ses/home?region=us-east-1#verified-senders-domain:)
1. clone the repo
1. `cp ./lambda/config.example.js ./lambda/config.js`
1. Fill in your info in the config file
1. `yarn`
1. `npx tsc`
1. `npx cdk synth`
1. `npx cdk deploy --require-approval never --profile mailman`
1. Go into [your SES Console](https://console.aws.amazon.com/ses/home?region=us-east-1#receipt-rules:) and set your new RuleSet as Active. If you have an existing RuleSet, clone it as backup then copy your new rules into your existing rule set manually.
1. [Verify the email address(es) that you're forwarding to](https://console.aws.amazon.com/ses/home?region=us-east-1#verified-senders-email:)
1. Send a test email to your recipient, and it should forward correctly

Note that only one ruleset can be active at a time.  If you have multiple rulesets in the same AWS account, then you have to have a root/default ruleset and then have copies of each domain rule inside of it.


## Updates
After pulling down a code update, re-run the deployment command:
1. `npx cdk deploy --require-approval never`
1. If you have only modified the lambda, then you are done.  If you have modified any CDK or related configuration that changes the SES rule set, then take the following manual steps:
1. Go into [your SES Console](https://console.aws.amazon.com/ses/home?region=us-east-1#receipt-rules:), locate your rule and copy it into your active rule set. You may have to change the name, to copy2, etc.
1. Open your active rule set, enable the new rule you just copied, then disable the old rule.

## Spam Filters

When `spamFilter` is set to `2` (Custom) in config, the following filters run in order:

| Filter | Config Field | What it does |
|--------|-------------|--------------|
| SES Receipt Verdicts | — | Drops emails that fail SPF, DKIM, spam, or virus checks |
| Subject Keyword | `subjectFilterKeywords` | Drops emails whose subject contains a blocklisted keyword |
| Target Recipient | `blockedRecipients` | Drops emails sent to specific honeypot/throwaway addresses |
| Sender Domain | `blockedSenderDomains` | Drops emails from known spam-sending domains |
| Bulk Mail Headers | `bulkMailHeaders` | Drops emails containing headers added by mass-mailer platforms (e.g. `X-Node-Mail`) |
| Brand Impersonation | `brandKeywords` + `trustedBrandDomains` | Drops emails where the From display name contains a brand name but the sender domain isn't that brand's real domain |

## Troubleshooting

CloudWatch Insights queries to run against the Lambda log group (e.g. `/aws/lambda/TylerWaltsSESForwarder`).

### Recent forwarded emails

```
fields @timestamp, mail.commonHeaders.from.0, mail.destination.0, mail.commonHeaders.subject, ispresent(mail.commonHeaders.from.0) as fw
| filter fw != 0
| sort @timestamp desc
| limit 10
```

### Top sender domains by volume

```
fields mail.source
| filter ispresent(mail.source)
| parse mail.source /(?<sender_domain>@.+)$/
| stats count() as email_count by sender_domain
| sort email_count desc
| limit 50
```

### Emails with bulk mail headers

```
fields @timestamp, mail.commonHeaders.from.0, mail.source
| filter ispresent(mail.source)
| filter @message like /X-Node-Mail/
  or @message like /X-Delivery-Attempt-ID/
  or @message like /X-Attachment-Ref/
  or @message like /X-Mailer-LID/
  or @message like /X-Campaign-ID/
| parse mail.source /(?<sender_domain>@.+)$/
| stats count() as bulk_count by sender_domain
| sort bulk_count desc
```

### From display name vs sender domain mismatch

Finds emails where the display name in From doesn't match the actual sending domain — ranked by volume.

```
fields mail.commonHeaders.from.0, mail.source
| filter ispresent(mail.commonHeaders.from.0) and ispresent(mail.source)
| parse mail.source /(?<sender_domain>[^@]+)$/ 
| parse mail.commonHeaders.from.0 /(?<display_name>[^<]+)/
| filter display_name not like sender_domain
| stats count() as mismatch_count by display_name, sender_domain
| sort mismatch_count desc
| limit 50
```

### Top recipients receiving the most email

Useful for identifying honeypot addresses getting hammered.

```
fields mail.destination.0
| filter ispresent(mail.destination.0)
| stats count() as email_count by mail.destination.0
| sort email_count desc
```

### Overall volume trend (weekly)

```
fields @timestamp
| filter ispresent(mail.source)
| stats count() as emails by bin(1w)
| sort @timestamp asc
```


-----


Example Log Insights Output

```
@requestId 5ea3ebd0-d3bc-4dde-bb15-9322c8bc4d1c
@timestamp 1780796520934
mail.commonHeaders.date Sat, 6 Jun 2026 21:38:56 -0400
mail.commonHeaders.from.0 C0stc0 Meat Special <cstcmeatspecial@ceedinary.com>
mail.commonHeaders.messageId <b523d430.huftedaiuywmqw2nedcgvrbfhpxkvfa@ceedinary.com>
mail.commonHeaders.replyTo.0 cstcmeatspecial@ceedinary.com
mail.commonHeaders.returnPath cstcmeatspecial@ceedinary.com
mail.commonHeaders.subject Thank You for Your Costco Stop, Meat Box Special
mail.commonHeaders.to.0 adobe@tylerwalts.com
mail.destination.0 adobe@tylerwalts.com
mail.headers.0.name Return-Path
mail.headers.0.value <cstcmeatspecial@ceedinary.com>
mail.headers.1.name Received
mail.headers.1.value from mail2.ceedinary.com (signal4107.hrillinois.com [103.27.248.101]) by inbound-smtp.us-west-2.amazonaws.com with SMTP id bjeaq8b6ultae1j07u2rjmh596k0k6japeqic601 for adobe@tylerwalts.com; Sun, 07 Jun 2026 01:38:58 +0000 (UTC)
mail.headers.2.name Received-SPF
mail.headers.2.value pass (spfCheck: domain of ceedinary.com designates 103.27.248.101 as permitted sender) client-ip=103.27.248.101; envelope-from=cstcmeatspecial@ceedinary.com; helo=mail2.ceedinary.com;
mail.headers.3.name Authentication-Results
mail.headers.3.value amazonses.com; spf=pass (spfCheck: domain of ceedinary.com designates 103.27.248.101 as permitted sender) client-ip=103.27.248.101; envelope-from=cstcmeatspecial@ceedinary.com; helo=mail2.ceedinary.com; dkim=pass header.i=@ceedinary.com; dmarc=pass header.from=ceedinary.com;
mail.headers.4.name X-SES-RECEIPT
mail.headers.4.value AEFBQUFBQUFBQUFIQTR5dDg4MFdvZzZ3WG5ZS0pBVFJ5Y0p6dE1NOHExUU5XQ0tMOUtXbERiTGR1Qll3Z3Nxb2RsRWhEQm5pNUphTlRDRlJSZkRQWjZzSzcvNEFQalhhNGtzVXlGOW5naW85ZXNFRTdJMmtTYVpmTFJzQkdUdnNMMDZuUGo5YXdPT2RISm9EaC9LSEhkcEhIYzM4SUNsL2t5a0xmazhGMytENUtIbkNBWTdraVczbGN6eUNIbDJwZWdIKzZpU2NiQ1loSzVxdVFyanZGYnhDN1hRa09iRVI4TXNYTE9mclI0cjBRdm9tMERHMkJXSm53VzZuRE9yMGRmNVp6TVcyYUdTU1BoQ2U0d0tXZHlxaW45Y0xsblJ2ZEc2R1ZCRTdPd0tZeE9kRDZVdy83aXV4U1lLQmZsa2UzZnBqbjNab1VBYjg9
mail.headers.5.name X-SES-DKIM-SIGNATURE
mail.headers.5.value a=rsa-sha256; q=dns/txt; b=YwIs+BqoqrAd4BCvxxZ8DRA3nOq56EHa2/MxZNKU+hkI+J6YnsgP1m/Ea4swCMbEse1FexgSMvIk08I3nF249aIsDP1r41oXfstLjiXa3e8q5LeZ6aZBmYFkad8YvhnAxEQknKi/02kRB1l+Dhls456plH98Rp5wQBPB+TzIDcM=; c=relaxed/simple; s=hsbnp7p3ensaochzwyq5wwmceodymuwv; d=amazonses.com; t=1780796343; v=1; bh=4Qu6GwwRj0BhAq/Q4hcfigVGt+ik3Zh32TBTRI1FQ1M=; h=From:To:Cc:Bcc:Subject:Date:Message-ID:MIME-Version:Content-Type:X-SES-RECEIPT;
mail.headers.6.name DKIM-Signature
mail.headers.6.value v=1; a=rsa-sha256; c=relaxed/relaxed; s=mtarxynztcv3m; d=ceedinary.com; h=Date:Subject:MIME-Version:Message-ID:List-Unsubscribe:Content-Type:Reply-To:From:To; i=cstcmeatspecial@ceedinary.com; bh=XoRyfstKbhWDejhh6/xiwgo/RLI6/eEHIHvF8/pb4AU=; b=Wry//2WNWa1IBXZk/UDQ2ruVEwUMIXQfLTM+N+V8I8QWGyRVF4XN+AwCf53nEzGk7CQPgWN/rtgb3KeD8NRUQI0j9/xxXm+49hHr4gfz9VdOrBD0aZf31Kr0Wp4dttstYoeru5FfsyrQqk35LxkiOTaVDx+cRFGeaaT/oMHnr7HecPLLS3ovmYUzjLGEtJPh79gRaiRsUMrP37nD4/wGd3MB29zHHYr8AXEvEqrrQc99Sb+yAkSOaHWqLGtq2vYC8sCDkvvfKYQX8/kgaydVQZEU/u7UuJsYWsOdVbqcKmU9Du6jHHdqAdy59P0g2zktcA01ZbE+WeSbI2QPMGhIcw==
mail.headers.7.name Date
mail.headers.7.value Sat, 6 Jun 2026 21:38:56 -0400
mail.headers.8.name Subject
mail.headers.8.value Thank You for Your Costco Stop, Meat Box Special
mail.headers.9.name MIME-Version
mail.headers.9.value 1.0
mail.headers.10.name Message-ID
mail.headers.10.value <b523d430.huftedaiuywmqw2nedcgvrbfhpxkvfa@ceedinary.com>
mail.headers.11.name List-Unsubscribe
mail.headers.11.value <https://ww1.ceedinary.com/0755236tthnexpiRnS>
mail.headers.12.name Content-Type
mail.headers.12.value multipart/alternative; boundary="--link._RelatedBoundary_a1hp2lbnfvcko38f93b-499592-RelatedPart"
mail.headers.13.name Reply-To
mail.headers.13.value cstcmeatspecial@ceedinary.com
mail.headers.14.name From
mail.headers.14.value C0stc0 Meat Special <cstcmeatspecial@ceedinary.com>
mail.headers.15.name To
mail.headers.15.value adobe@tylerwalts.com
mail.headers.16.name List-Unsubscribe-Post
mail.headers.16.value List-Unsubscribe=One-Click
mail.headers.17.name X-Message-ID
mail.headers.17.value 78e5ahr0sgpvdj6sh34bkmvdq53yqqoc5
mail.headers.18.name X-Transport-Ref
mail.headers.18.value 20938.McTsp.HSkcdbuCSCS
mail.headers.19.name X-Special-Header
mail.headers.19.value forwarded
mail.headersTruncated 0
mail.messageId bjeaq8b6ultae1j07u2rjmh596k0k6japeqic601
mail.source cstcmeatspecial@ceedinary.com
mail.timestamp 2026-06-07T01:38:58.491Z
receipt.action.functionArn arn:aws:lambda:us-west-2:680397041807:function:TylerWaltsSESForwarder
receipt.action.invocationType Event
receipt.action.type Lambda
receipt.dkimVerdict.status PASS
receipt.dmarcVerdict.status PASS
receipt.processingTimeMillis 5002
receipt.recipients.0 adobe@tylerwalts.com
receipt.spamVerdict.status DISABLED
receipt.spfVerdict.status PASS
receipt.timestamp 2026-06-07T01:38:58.491Z
receipt.virusVerdict.status DISABLED
```

Fields of Interest

```
mail.commonHeaders.from.0
mail.commonHeaders.replyTo.0
mail.commonHeaders.subject
mail.commonHeaders.to.0
mail.destination.0
mail.headers.8.name
mail.headers.8.value
mail.source
receipt.recipients.0
```

