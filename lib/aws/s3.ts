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

type ExtUrl = { label?: string, url: string };
type ExternalUrls<T = ExtUrl> = Array<T>;
export type UrlCustomizer = (externalUrls: ExternalUrls | undefined, gi: GoalInvocation) => Promise<ExternalUrls | undefined>;
export type UrlCustomizerOptions = {
    urlCustomizer: UrlCustomizer;
}

type PathTranslation = PublishToS3Options["pathTranslation"];

const isNotUndefined = <T>(t: T | undefined): t is T => t !== undefined;

// we don't extend PublishToS3 as the super.register will trigger the normal executePublishToS3
export class PublishToS3IndexShimsAndUrlCustomizer extends GoalWithFulfillment {
    constructor(private readonly optionsExt: PublishToS3Options & PredicatedGoalDefinition & UrlCustomizerOptions) {
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

export function executePublishToS3Shim(inputParams: PublishToS3Options & UrlCustomizerOptions): ExecuteGoal {
    const filesToPublishIndexShim = inputParams.filesToPublish.map(gp => gp.replace(/\/\*$/, "/index.html")).filter(gp => gp.endsWith("/index.html"));

    const ptWrapper = (tform: PathTranslation) => (filepath: string, gi: GoalInvocation) =>
        (tform || ((fp) => fp))(!!inputParams.pathTranslation ? inputParams.pathTranslation(filepath, gi) : filepath, gi);

    const shim1 = executePublishToS3({
        ...inputParams,
        filesToPublish: filesToPublishIndexShim,
        pathTranslation: ptWrapper((fp) => fp.replace('/index.html', ''))
    });
    const shim2 = executePublishToS3({
        ...inputParams,
        filesToPublish: filesToPublishIndexShim,
        pathTranslation: ptWrapper((fp) => fp.replace('index.html', ''))
        // (filepath: string, gi: GoalInvocation) =>
        // !!inputParams.pathTranslation ? inputParams.pathTranslation(filepath, gi).replace('/index.html', '') : filepath,
    });
    const main = executePublishToS3(inputParams);

    return (async gi => {
        // const [mainRes, s1Res, s2Res]
        const ress = [await main(gi), await shim1(gi), await shim2(gi)];
        const codes = ress.map(r => _.get(r, 'code')).filter(c => c !== undefined);
        const nonZeroCodes = codes.filter(c => c !== 0)
        const promExtUrls = await Promise.all(_.flatten(ress.map(r =>
            inputParams.urlCustomizer(((_.get(r, 'externalUrls') || [])), gi)
        )));
        const externalUrls: ExternalUrls = _.uniqWith(_.filter(_.flatten(promExtUrls), isNotUndefined), _.isEqual);
        return {
            code: nonZeroCodes.length > 0 ? nonZeroCodes[0] : 0,
            externalUrls
        }
    })
}
