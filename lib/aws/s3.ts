import {PublishToS3Options} from "@atomist/sdm-pack-s3";
import {
    ExecuteGoal,
    PredicatedGoalDefinition,
    SoftwareDeliveryMachine
} from "@atomist/sdm";
import {GoalInvocation} from "@atomist/sdm/lib/api/goal/GoalInvocation";
import _ from "lodash";
import {GoalWithFulfillment} from "@atomist/sdm/lib/api/goal/GoalWithFulfillment";
import {logger} from "@atomist/automation-client/lib/util/logger";
import {doWithFiles} from "@atomist/automation-client/lib/project/util/projectUtils";
import {executePublishToS3} from "./publishToS3";

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
                    logInterpreter: (log) => ({message: log, relevantPart: log}),
                });
            }
        });
    }
}

export function executePublishToS3Shim(inputParams: PublishToS3Options & PublishToS3ExtOptions): ExecuteGoal {

    const ptAndThen = (tform: PathTranslation) => (filepath: string, gi: GoalInvocation) =>
        (tform || ((fp) => fp))(!!inputParams.pathTranslation ? inputParams.pathTranslation(filepath, gi) : filepath, gi);

    if (inputParams.sync) {
        logger.warn(`using sync:true is unsafe! it will delete everything in the s3 bucket. changing to sync:false`);
        inputParams.sync = false;
    }

    // main s3 push execution
    //@ts-ignore
    const executionFuncs = [executePublishToS3({ ...inputParams, doWithFiles: doWithFiles})];

    if (inputParams.enableIndexShims) {
        const filesToPublishIndexShim = inputParams.filesToPublish.filter(gp => gp.endsWith("/*")).map(gp => gp.slice(0, gp.length - 2) + "/index.html").filter(gp => gp.endsWith("/index.html"));
        logger.debug(`executePublishToS3Shim:
baseFileGlobs: ${JSON.stringify(inputParams.filesToPublish, null, 2)}
and fileGlobs related to index shims: ${JSON.stringify(filesToPublishIndexShim, null, 2)}`);

        executionFuncs.push(executePublishToS3({
            ...inputParams,
            filesToPublish: filesToPublishIndexShim,
            pathTranslation: ptAndThen((fp) => fp.replace('/index.html', ''))
        }));
        executionFuncs.push(executePublishToS3({
            ...inputParams,
            filesToPublish: filesToPublishIndexShim,
            pathTranslation: ptAndThen((fp) => fp.replace('index.html', ''))
        }));
    }

    return (async gi => {
        // run the ExecuteGoal functions we created earlier.
        // ress is a list of results from executePublishToS3 which are functions like this one, so we pass in our `gi`
        const ress = await Promise.all(executionFuncs.map(f => f(gi)));
        const codes = ress.map(r => _.get(r, 'code')).filter(c => c !== undefined);
        logger.warn(`s3 upload responses: ${JSON.stringify(ress)}`)

        /* const mid = await doWithProject(async pa => {
            await pa.spawn("ls", ["-al"])
            await pa.spawn("ls", ["-al", "_site"])
        })(gi)
        if (!mid || mid.code !== 0) {
            return mid
        } */

        const nonZeroCodes = codes.filter(c => c !== 0)
        const promExtUrls = await Promise.all(_.flatten(ress.map(r =>
            inputParams.urlCustomizer(_.get(r, 'externalUrls') || [], gi)
        )));
        const externalUrls: ExternalUrls = _.uniqWith(_.filter(_.flatten(promExtUrls), isNotUndefined), _.isEqual);

        return {
            code: nonZeroCodes.length > 0 ? nonZeroCodes[0] : 0,
            externalUrls,
            message: _.map(ress, r => _.get(r, 'message', `<s3 upload job: no output; urls: ${JSON.stringify(_.get(r, 'externalUrls') || [])}>`)).join('\n\n')
        }
    })
}
