import {PublishToS3Options} from "@atomist/sdm-pack-s3";
import {
    ExecuteGoal,
    LogSuppressor,
    PredicatedGoalDefinition,
    SoftwareDeliveryMachine
} from "@atomist/sdm";
import {executePublishToS3} from "@atomist/sdm-pack-s3/lib/publishToS3";
import {GoalInvocation} from "@atomist/sdm/lib/api/goal/GoalInvocation";
import _ from "lodash";
import {GoalWithFulfillment} from "@atomist/sdm/lib/api/goal/GoalWithFulfillment";
import {logger} from "@atomist/automation-client";

type ExtUrl = { label?: string, url: string };
type ExternalUrls<T = ExtUrl> = Array<T>;
export type UrlCustomizer = (externalUrls: ExternalUrls | undefined, gi: GoalInvocation) => Promise<ExternalUrls | undefined>;
export type PublishToS3ExtOptions = {
    urlCustomizer: UrlCustomizer;
    enableIndexShims: boolean;
}

type PathTranslation = PublishToS3Options["pathTranslation"];

const isNotUndefined = <T>(t: T | undefined): t is T => t !== undefined;

// we don't extend PublishToS3 as the super.register will trigger the normal executePublishToS3
export class PublishToS3IndexShimsAndUrlCustomizer extends GoalWithFulfillment {
    constructor(private readonly optionsExt: PublishToS3Options & PredicatedGoalDefinition & PublishToS3ExtOptions) {
        super({
            workingDescription: "Publishing to S3",
            completedDescription: "Published to S3",
            ...optionsExt,
        });
    }

    public register(sdm: SoftwareDeliveryMachine): void {
        super.register(sdm);

        sdm.addStartupListener(async () => {
            if (this.fulfillments.length === 0 && this.callbacks.length === 0) {
                this.with({
                    name: `publishToS3-${this.optionsExt.bucketName}`,
                    goalExecutor: executePublishToS3Shim(this.optionsExt),
                    logInterpreter: LogSuppressor,
                });
            }
        });
    }
}

export function executePublishToS3Shim(inputParams: PublishToS3Options & PublishToS3ExtOptions): ExecuteGoal {

    const ptWrapper = (tform: PathTranslation) => (filepath: string, gi: GoalInvocation) =>
        (tform || ((fp) => fp))(!!inputParams.pathTranslation ? inputParams.pathTranslation(filepath, gi) : filepath, gi);

    // main s3 push execution
    const results = [executePublishToS3(inputParams)];
    if (inputParams.enableIndexShims) {
        const filesToPublishIndexShim = inputParams.filesToPublish.filter(gp => gp.endsWith("/*")).map(gp => gp.slice(0, gp.length - 2) + "/index.html").filter(gp => gp.endsWith("/index.html"));
        logger.info(`executePublishToS3Shim:
    
baseFileGlobs: ${JSON.stringify(inputParams.filesToPublish, null, 2)}

and fileGlobs related to index shims: ${JSON.stringify(filesToPublishIndexShim, null, 2)}`);

        const shim1 = executePublishToS3({
            ...inputParams,
            filesToPublish: filesToPublishIndexShim,
            pathTranslation: ptWrapper((fp) => fp.replace('/index.html', ''))
        });
        const shim2 = executePublishToS3({
            ...inputParams,
            filesToPublish: filesToPublishIndexShim,
            pathTranslation: ptWrapper((fp) => fp.replace('index.html', ''))
        });
        results.push(shim1, shim2);
    }

    return (async gi => {
        // const [mainRes, s1Res, s2Res]
        const ress = await Promise.all(results);
        const codes = ress.map(r => _.get(r, 'code')).filter(c => c !== undefined);
        const nonZeroCodes = codes.filter(c => c !== 0)
        const promExtUrls = await Promise.all(_.flatten(ress.map(r =>
            inputParams.urlCustomizer(_.get(r, 'externalUrls') || [], gi)
        )));
        const externalUrls: ExternalUrls = _.uniqWith(_.filter(_.flatten(promExtUrls), isNotUndefined), _.isEqual);
        return {
            code: nonZeroCodes.length > 0 ? nonZeroCodes[0] : 0,
            externalUrls,
            message: _.map(ress, r => _.get(r, 'message', "<no output>")).join('\n\n')
        }
    })
}
