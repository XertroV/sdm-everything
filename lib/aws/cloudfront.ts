import AWS = require("aws-sdk");
import {get} from "lodash";
import {namedLogger} from "../util/namedLogger";

const logger = namedLogger("cloudfront");

// replay protection
const mkCallerRef = () => `${Date.now()}`;

export const cfCreateDistribution = async (shaFrag: string, opts?: {originId?: string, Enabled?: boolean}): Promise<AWS.CloudFront.CreateDistributionResult> => {
    const originId = opts?.originId || `S3-preview-website-origin-${shaFrag}`;
    const cf = new AWS.CloudFront();

    // const origin = await cf.createCloudFrontOriginAccessIdentity({
    //     CloudFrontOriginAccessIdentityConfig: {CallerReference: mkCallerRef(), Comment: `S3-origin-preview-${shaFrag}`}
    // })

    logger.debug(`Creating CloudFront distrib with opts`, shaFrag, originId);
    logger.debug(`Creating CloudFront distrib with opts: ${shaFrag}, ${originId}`);

    const certArn = get(opts, "CertificateARN", "arn:aws:acm:us-east-1:076866892044:certificate/049db79c-199d-4afd-91d7-1b391a63922e");
    const viewerCert = !certArn ? undefined : {
        ACMCertificateArn: certArn,
        SSLSupportMethod: "sni-only",
        MinimumProtocolVersion: "TLSv1.2_2018",
    };



    const distrib = await cf.createDistribution({
        DistributionConfig: {
            Aliases: {
                Quantity: 1,
                Items: [`${shaFrag}.preview.flx.dev`],
            },
            CallerReference: mkCallerRef(),
            Comment: `S3-flux-website-preview-${shaFrag}`,
            DefaultCacheBehavior: {
                ForwardedValues: {
                    QueryString: false,
                    Cookies: {Forward: "none"},
                },
                TargetOriginId: originId,
                TrustedSigners: {
                    Enabled: false,
                    Quantity: 0,
                },
                ViewerProtocolPolicy: "redirect-to-https",
                MinTTL: 600,
            },
            DefaultRootObject: "index.html",
            Origins: {
                Quantity: 1,
                Items: [
                    {
                        OriginPath: `/${shaFrag}`,
                        DomainName: `preview.flx.dev.s3.amazonaws.com`,
                        Id: originId,
                        S3OriginConfig: {
                            OriginAccessIdentity: "",
                        }, // as AWS.CloudFront.S3OriginConfig
                    }, // as AWS.CloudFront.Origin
                ],
            },
            Enabled: get(opts, "Enabled", true),
            ViewerCertificate: viewerCert,
            /*{
                ACMCertificateArn: certArn,
                SSLSupportMethod: "sni-only",
                MinimumProtocolVersion: "TLSv1.2_2018",
            },*/
        },
    }, // as AWS.CloudFront.CreateDistributionRequest
    // , (err, val) => {});
    ).promise();

    return distrib;
};

export const cfDeleteDistribution = async (Id: string, eTagForIfMatch: string) => {
    const cf = new AWS.CloudFront();

    // const disRes = await cf.updateDistribution({
    //     DistributionConfig: { Enabled: false, CallerReference: mkCallerRef() },
    //     Id,
    // }).promise();

    // if (disRes.$response.error) {
    //     return disRes;
    // }

    const delRes = await cf.deleteDistribution({Id, IfMatch: eTagForIfMatch}).promise();
    return delRes;
};
