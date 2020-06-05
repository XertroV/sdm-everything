// import {
//     addressChannelsProgressLog,
//     doWithProject,
//     filesChangedSince,
//     goal,
//     GoalInvocation, lastLinesLogInterpreter,
//     LoggingProgressLog, ProjectAwareGoalInvocation,
//     PushListenerInvocation,
//     pushTest, spawnPromise,
//     StringCapturingProgressLog,
//     WritableLog,
//     WriteToAllProgressLog,
// } from "@atomist/sdm";
//
// import { isInLocalMode } from "@atomist/sdm-core";
// import {BuildingContainer} from "@atomist/sdm-core/lib/goal/container/buildingContainer";
// import {spawnBuilder} from "@atomist/sdm-pack-build";

import {RemoteRepoRef} from "@atomist/automation-client/lib/operations/common/RepoId";
import {GitProject} from "@atomist/automation-client/lib/project/git/GitProject";
import {Project} from "@atomist/automation-client/lib/project/Project";
import {spawnPromise} from "@atomist/automation-client/lib/util/child_process";
import {logger} from "@atomist/automation-client/lib/util/logger";
import {spawnBuilder} from "@atomist/sdm-pack-build";
import {PublishToS3} from "@atomist/sdm-pack-s3/lib";
import {addressChannelsProgressLog} from "@atomist/sdm/lib/api-helper/log/addressChannelsProgressLog";
import {LoggingProgressLog} from "@atomist/sdm/lib/api-helper/log/LoggingProgressLog";
import {lastLinesLogInterpreter} from "@atomist/sdm/lib/api-helper/log/logInterpreters";
import {StringCapturingProgressLog} from "@atomist/sdm/lib/api-helper/log/StringCapturingProgressLog";
import {WriteToAllProgressLog} from "@atomist/sdm/lib/api-helper/log/WriteToAllProgressLog";
import {filesChangedSince} from "@atomist/sdm/lib/api-helper/misc/git/filesChangedSince";
import {doWithProject, ProjectAwareGoalInvocation} from "@atomist/sdm/lib/api-helper/project/withProject";
import {GoalInvocation} from "@atomist/sdm/lib/api/goal/GoalInvocation";
import {goal} from "@atomist/sdm/lib/api/goal/GoalWithFulfillment";
import {PushListenerInvocation} from "@atomist/sdm/lib/api/listener/PushListener";
import {pushTest} from "@atomist/sdm/lib/api/mapping/PushTest";
import {isInLocalMode} from "@atomist/sdm/lib/core/machine/modes";
import {cfCreateDistribution} from "./aws/cloudfront";
import {setGhCheckStatus} from "./listeners/GithubChecks";
import {asSpawnCommand, SpawnCommand} from "./util/spawn";

const mkAppInfo = async (p: Project) => {
    return {
        name: p.id.repo,
        version: p.id.sha || "0.0.0",
        id: p.id as RemoteRepoRef,
    };
};

export const mkBashCommand = (cmd: string) => {
    return {
        command: "bash",
        args: ["-c", cmd],
    };
};

export const thankAuthorInChannelGoal = goal(
    {
        displayName: "msgDisplayName",
    },
    async (gi: GoalInvocation) => {
        const screenName = gi.goalEvent.push.after?.author?.person?.chatId?.screenName;
        const author = gi.goalEvent.push.commits?.map(el => el?.author?.name)[0];

        if (!!screenName) {
            // await gi.context.messageClient.addressUsers(":tada: Thanks for contributing! :relaxed:", screenName);
        }
        await gi.addressChannels(`:tada: Thanks to ${!!screenName ? `@${screenName}` : author} for contributing! ${gi.goalEvent.sha.slice(0, 8)} :rocket:`);
    },
);

export const shouldRebuildSite = pushTest(
    "shouldRebuildSite",
    async (pli: PushListenerInvocation) => {
        const changedFiles = await filesChangedSince(pli.project, pli.push);
        logger.info(`shouldRebuildSite - changedFiles: ${JSON.stringify(changedFiles)}`);

        if (changedFiles?.length === 1 && changedFiles[0] === "README.md") {
            return false;
        }
        return true;
    },
);

export const isFluxSiteRepo = pushTest(
    "isFluxSiteRepo",
    async (pli: PushListenerInvocation) => {
        logger.info(`isFluxSiteRepo pushTest: ${pli.push.repo?.owner}/${pli.push.repo?.name}`);
        return pli.push.repo?.owner === "voteflux" && pli.push.repo?.name === "flux-website-v2";
    },
);

// @ts-ignore TS6133
const shimLog = (log: WritableLog) => ({
    stripAnsi: true,
    write: (msg: string) => {
        logger.info(`shimLog [${Date()}] ${msg}.`);
        log.write(msg);
    },
});

export const buildWebsiteOld = goal(
    { displayName: "Build the Flux Website" },
    doWithProject(async (gi: ProjectAwareGoalInvocation) => {
        const GH_ACTION_NAME = "jekyll-build";

        // const ghToken = (gi.credentials as TokenCredentials).token;
        // const gh = new Octokit({auth: `token ${ghToken}`});
        const startTS = new Date();
        await setGhCheckStatus({name: GH_ACTION_NAME, gi, status: "in_progress", conclusion: undefined, startTS} );

        const collectStdOut = new StringCapturingProgressLog();
        const allLogs = new WriteToAllProgressLog(
            "flux-website-build",
            new LoggingProgressLog("flux-website-build-logger", "info"),
            gi.progressLog,
            addressChannelsProgressLog("flux-website-build-chat", {channels: []}, gi.context),
            collectStdOut,
        );

        const commonSpawnOpts = {cwd: gi.project.baseDir, log: allLogs};
        const dockerBuildArgs = [" build", "-f", "./_docker-dev/Dockerfile", "-t", "flux-website-docker-dev:latest", "."];
        const dockerBuildRes = await spawnPromise("docker", dockerBuildArgs, commonSpawnOpts);
        const rNpmI = await spawnPromise("./dev-docker.sh", ["build"], commonSpawnOpts);
        // var res = await action.spawn("./dev-docker.sh", ["build"], {cwd: action.project.baseDir, log: allLogs});

        logger.info(`Docker Build status: ${dockerBuildRes.status}`);
        logger.info(`Jekyll Build status: ${rNpmI.status}`);

        const endTS = new Date();
        const res = rNpmI;
        const didError = res.error || (res.status !== 0);

        // const gh = githubApi((action.credentials as TokenCredentials).token)
        await setGhCheckStatus({
            name: GH_ACTION_NAME,
            gi,
            status: "completed",
            conclusion: didError ? "failure" : "success",
            startTS,
            endTS,
            output: didError ? {
                title: `Jekyll Build Failed`,
                summary: res.error?.name || "No error name found",
                text: res.error?.message || "No error msg found",
            } : {
                title: `Jekyll Build Succeeded`,
                summary: collectStdOut.log.split("\n").reverse()[0],
                text: collectStdOut.log,
            },
        });

        const logFileName = `jekyll-build-${Date.now()}-${gi.goalEvent.sha.slice(0, 8)}`;

        if (didError) {
            // magic string we print in `npm run build`
            const [preJekyllErr, jekyllErr] = collectStdOut.log.split("--JEKYLL-BUILD--");
            const errToSend = jekyllErr || preJekyllErr;

            await gi.addressChannels({
                title: `Jekyll build failed; status: ${res.status}`,
                content: `JEKYLL BUILD ERROR:\n\n${errToSend}`,
                fileName: logFileName,
                fileType: `text`,
            });
        } else {
            // await action.addressChannels({
            //     // title: `Jekyll build succeeded!`,
            //     // content: collectStdOut.log.split("\n").reverse().slice(0, 30).reverse().join("\n"),
            //     // fileName: logFileName,
            //     // fileType: `text`,
            // });
        }

        return { code: res.status !== 0 ? (res.status || -1) : res.status }; // as ExecuteGoalResult; // { code: res.code }
    }),
);

/* export const buildFluxSiteUsingImage = new BuildingContainer({
    displayName: "Jekyll Build Container",
}, {
    output: [{pattern: {directory: "_site"}, classifier: "flux-site-jekyll-build-output"}],
    containers: [
        { name: "", image: "", volumeMounts: [], command: [], env: [{name: "SOME_ENV", value: ""}] },
    ],
    name: "Jekyll Build Container (Registration)",
}); */

// @ts-ignore
const toSpawnCommand = (c: string | SpawnCommand, i, a): SpawnCommand => typeof c === "string" ? asSpawnCommand(c) : c;

export const buildWebsiteBuilder = spawnBuilder({
    name: "jekyll builder",
    logInterpreter: lastLinesLogInterpreter("Tail of the log:", 10),
    projectToAppInfo: mkAppInfo,
    commands: [
        "docker build -f ./_docker-dev/Dockerfile -t flux-website-docker-dev:latest .",
        {
            command: "bash", args: ["-c",
                "docker run --rm --mount type=volume,src=flux-site-vol-node,dst=/src/node_modules --mount type=volume,src=flux-site-vol-bundle-gems,dst=/src/.bundle-gems --mount type=volume,src=flux-site-vol-bundle,dst=/src/.bundle --mount type=bind,src=$PWD,dst=/src --env NODE_ENV=production flux-website-docker-dev:latest bash  -c \"npm run --silent build || (npm ci && npm run build)\"",
            ],
        },
    ].map(toSpawnCommand),
    async deploymentUnitFor(p: GitProject, appId): Promise<string> {
        return "_site";
    },
});

export const publishSitePreview = new PublishToS3({
    displayName: "Publish to S3",
    uniqueName: "publish-preview-to-s3",
    bucketName: "preview.flx.dev",
    region: "ap-southeast-2", // use your region
    filesToPublish: ["_site/**/*"],
    pathTranslation: (filepath: string, gi: GoalInvocation) => filepath.replace(/^_site/, `${gi.goalEvent.sha.slice(0, 7)}`),
    pathToIndex: "_site/index.html", // index file in your project
    linkLabel: "S3 Link",
});

export const makeCloudFrontDistribution = goal(
    { displayName: "Deploy Preview (S3/CloudFront)", uniqueName: "deploy-preview-cloudfront" },
    doWithProject(async (pa: ProjectAwareGoalInvocation) => {
        const shaFrag = pa.goalEvent.sha.slice(0, 7);

        if (isInLocalMode()) {
            logger.warn(`Not creating cloudfront distribution as we're in local mode.`);
            return { code: 0 };
        }

        const distrib = await cfCreateDistribution(shaFrag);
        // logger.info(distrib);

        /*
        // const cf = new AWS.CloudFront();
        // const originId = `S3-preview-website-origin-${shaFrag}`;
        // // const origin = await cf.createCloudFrontOriginAccessIdentity({
        // //     CloudFrontOriginAccessIdentityConfig: {CallerReference: mkCallerRef(), Comment: `S3-origin-preview-${shaFrag}`}
        // // })
        // const distrib = await cf.createDistribution({
        //     DistributionConfig: {
        //         CallerReference: mkCallerRef(),
        //         Comment: `S3-flux-website-preview-${shaFrag}`,
        //         DefaultCacheBehavior: {
        //             ForwardedValues: {
        //                 QueryString: false,
        //                 Cookies: {Forward: 'none'},
        //             },
        //             TargetOriginId: originId,
        //             TrustedSigners: {
        //                 Enabled: false,
        //                 Quantity: 0
        //             },
        //             ViewerProtocolPolicy: "redirect-to-https",
        //             MinTTL: 600,
        //         },
        //         Origins: {
        //             Quantity: 1,
        //             Items: [
        //                 {
        //                     OriginPath: `/${shaFrag}/`,
        //                     DomainName: `preview.flx.dev.s3-website-ap-southeast-2.amazonaws.com`,
        //                     Id: originId,
        //                     S3OriginConfig: {
        //                         OriginAccessIdentity: "",
        //                     }// as AWS.CloudFront.S3OriginConfig
        //                 }// as AWS.CloudFront.Origin
        //             ]
        //         },
        //         Enabled: true,
        //         // ViewerProtocolPolicy: "redirect-to-https"
        //     }
        // } as AWS.CloudFront.CreateDistributionRequest
        // //, (err, val) => {});
        // );
        // aws s3 sync _site/ s3://preview.flx.dev/test/ --acl public-read --expires $(expr $(date +%s) + $(expr 7 \* 86400))
        // aws configure set preview.cloudfront true && aws cloudfront create-invalidation --distribution-id <dist-id> --paths /index.html
        */

        // do this for the moment (always use cloudfront domain) to avoid needing to do R53 stuff
        const distribUrls = ([ distrib.Distribution?.DomainName, ...(distrib.Distribution?.DistributionConfig.Aliases?.Items || []) ])
            .filter(v => typeof v === "string");
        // const resultMessageCustomDomains =
        return {
            code: 0,
            externalUrls: [ {label: `!! Deploy Preview: ${shaFrag} !!`, url: `https://${distribUrls[0]}/index.html`} ],
            message: `# Success\n\n${distribUrls.map(cname => `## Deployed to: <https://${cname}>`).join("\n\n") ||
                "No url available :(\n\n(This means something went wrong)"}`,
        };
    }),
);

// const websitePrListener =
