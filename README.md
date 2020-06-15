# sdm-everything

<!-- 
[![atomist sdm goals](http://badge.atomist.com/T29E48P34/atomist-seeds/empty-sdm/c796f715-67c3-48ae-8b7c-45c0fd31443f)](https://app.atomist.com/workspace/T29E48P34)
[![npm version](https://img.shields.io/npm/v/@atomist-seeds/empty-sdm.svg)](https://www.npmjs.com/package/@atomist-seeds/empty-sdm)
-->

Dependencies & quick start:

```bash
npm i atomist-sdm-* 
npm i
npm run start
```

> Note: it should crash at this point unless one of the [SDM configuration tests](https://github.com/XertroV/sdm-everything/blob/master/index.ts#L49) returned true.  

Setup:

* AWS creds and `AWS_SDK_LOAD_CONFIG=1`
* atomist API key etc
* docker installed + be in docker group


Software delivery machines enable you to control your delivery process
in code.  Think of it as an API for your software delivery.  See the
[Atomist documentation][atomist-doc] for more information on the
concept of a software delivery machine and how to create and develop
an SDM.

[atomist-doc]: https://docs.atomist.com/ (Atomist Documentation)

## Issues

- [ ] CloudFront preview can fail due to CNAME being associated with a different distribution; check to see if that's due to same git hash -> but new distrib, how to check existing distribs?

## AWS permissions

### S3 maximal permissions

```
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "VisualEditor0",
            "Effect": "Allow",
            "Action": [
                "s3:GetLifecycleConfiguration",
                "s3:GetBucketTagging",
                "s3:GetInventoryConfiguration",
                "s3:GetObjectVersionTagging",
                "s3:ListBucketVersions",
                "s3:GetBucketLogging",
                "s3:ListBucket",
                "s3:GetAccelerateConfiguration",
                "s3:GetBucketPolicy",
                "s3:GetObjectVersionTorrent",
                "s3:GetObjectAcl",
                "s3:GetEncryptionConfiguration",
                "s3:GetBucketObjectLockConfiguration",
                "s3:GetBucketRequestPayment",
                "s3:GetObjectVersionAcl",
                "s3:GetObjectTagging",
                "s3:GetMetricsConfiguration",
                "s3:DeleteObject",
                "s3:PutObjectAcl",
                "s3:GetBucketPublicAccessBlock",
                "s3:GetBucketPolicyStatus",
                "s3:ListBucketMultipartUploads",
                "s3:GetObjectRetention",
                "s3:GetBucketWebsite",
                "s3:GetBucketVersioning",
                "s3:GetBucketAcl",
                "s3:GetObjectLegalHold",
                "s3:GetBucketNotification",
                "s3:GetReplicationConfiguration",
                "s3:ListMultipartUploadParts",
                "s3:PutObject",
                "s3:GetObject",
                "s3:GetObjectTorrent",
                "s3:PutBucketWebsite",
                "s3:GetBucketCORS",
                "s3:GetAnalyticsConfiguration",
                "s3:GetObjectVersionForReplication",
                "s3:GetBucketLocation",
                "s3:GetObjectVersion"
            ],
            "Resource": [
                "arn:aws:s3:::preview.flx.dev",
                "arn:aws:s3:::preview.flx.dev/*"
            ]
        },
        {
            "Sid": "VisualEditor1",
            "Effect": "Allow",
            "Action": [
                "s3:GetAccessPoint",
                "s3:GetAccountPublicAccessBlock",
                "s3:ListAllMyBuckets",
                "s3:ListAccessPoints",
                "s3:ListJobs",
                "s3:HeadBucket"
            ],
            "Resource": "*"
        }
    ]
}
```

### Cloudfront maximal permissions

```
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "VisualEditor0",
            "Effect": "Allow",
            "Action": [
                "cloudfront:GetDistribution",
                "cloudfront:GetCloudFrontOriginAccessIdentityConfig",
                "cloudfront:GetStreamingDistributionConfig",
                "cloudfront:GetStreamingDistribution",
                "cloudfront:ListTagsForResource",
                "cloudfront:ListInvalidations",
                "cloudfront:GetInvalidation",
                "cloudfront:GetCloudFrontOriginAccessIdentity",
                "cloudfront:CreateDistribution",
                "cloudfront:GetDistributionConfig",
                "cloudfront:CreateCloudFrontOriginAccessIdentity"
            ],
            "Resource": [
                "arn:aws:cloudfront::*:distribution/*",
                "arn:aws:cloudfront::*:origin-access-identity/*",
                "arn:aws:cloudfront::*:streaming-distribution/*"
            ]
        },
        {
            "Sid": "VisualEditor1",
            "Effect": "Allow",
            "Action": [
                "cloudfront:CreateDistribution",
                "cloudfront:ListCloudFrontOriginAccessIdentities",
                "cloudfront:ListFieldLevelEncryptionConfigs",
                "cloudfront:GetPublicKeyConfig",
                "cloudfront:ListDistributionsByLambdaFunction",
                "cloudfront:GetPublicKey",
                "cloudfront:ListPublicKeys",
                "cloudfront:GetFieldLevelEncryption",
                "cloudfront:ListDistributions",
                "cloudfront:ListFieldLevelEncryptionProfiles",
                "cloudfront:ListStreamingDistributions",
                "cloudfront:ListDistributionsByWebACLId",
                "cloudfront:GetFieldLevelEncryptionProfileConfig",
                "cloudfront:GetFieldLevelEncryptionConfig",
                "cloudfront:GetFieldLevelEncryptionProfile"
            ],
            "Resource": "*"
        }
    ]
}
```





## Getting started

See the [Developer Quick Start][atomist-quick] to jump straight to
creating an SDM.

[atomist-quick]: https://docs.atomist.com/quick-start/ (Atomist - Developer Quick Start)

## Contributing

Contributions to this project from community members are encouraged
and appreciated. Please review the [Contributing
Guidelines](CONTRIBUTING.md) for more information. Also see the
[Development](#development) section in this document.

## Code of conduct

This project is governed by the [Code of
Conduct](CODE_OF_CONDUCT.md). You are expected to act in accordance
with this code by participating. Please report any unacceptable
behavior to code-of-conduct@atomist.com.

## Documentation

Please see [docs.atomist.com][atomist-doc] for
[developer][atomist-doc-sdm] documentation.

[atomist-doc-sdm]: https://docs.atomist.com/developer/sdm/ (Atomist Documentation - SDM Developer)

## Connect

Follow [@atomist][atomist-twitter] and [the Atomist blog][atomist-blog].

[atomist-twitter]: https://twitter.com/atomist (Atomist on Twitter)
[atomist-blog]: https://blog.atomist.com/ (The Official Atomist Blog)

## Support

General support questions should be discussed in the `#support`
channel in the [Atomist community Slack workspace][slack].

If you find a problem, please create an [issue][].

[issue]: https://github.com/atomist-seeds/empty-sdm/issues

## Development

You will need to install [Node.js][node] to build and test this
project.

[node]: https://nodejs.org/ (Node.js)

### Build and test

Install dependencies.

```
$ npm install
```

Use the `build` package script to compile, test, lint, and build the
documentation.

```
$ npm run build
```

### Release

Releases are handled via the [Atomist SDM][atomist-sdm].  Just press
the 'Approve' button in the Atomist dashboard or Slack.

[atomist-sdm]: https://github.com/atomist/atomist-sdm (Atomist Software Delivery Machine)

---

Created by [Atomist][atomist].
Need Help?  [Join our Slack workspace][slack].

[atomist]: https://atomist.com/ (Atomist - How Teams Deliver Software)
[slack]: https://join.atomist.com/ (Atomist Community Slack)
