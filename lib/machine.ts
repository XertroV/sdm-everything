import { filesChangedSince, goal, GoalInvocation, PushListenerInvocation, pushTest, ProjectAwareGoalInvocation, doWithProject, spawnPromise, WritableLog, WriteToAllProgressLog, LoggingProgressLog, addressChannelsProgressLog, StringCapturingProgressLog, ExecuteGoalResult } from "@atomist/sdm";
import { isInLocalMode } from "@atomist/sdm-core";

import {Octokit} from "@octokit/rest";
import { TokenCredentials } from "@atomist/automation-client";

import * as AWS from 'aws-sdk';


export const msgGoal = goal(
    {
        displayName: "msgDisplayName",
    },
    async (gi: GoalInvocation) => {
        const screenName = gi.sdmGoal.push.after?.author?.person?.chatId?.screenName;
        const author = gi.sdmGoal.push.commits?.map(el => el?.author?.name)[0];

        if (!!screenName) {
            await gi.context.messageClient.addressUsers(":tada: Thanks for contributing! :relaxed:", screenName);
        }
        await gi.addressChannels(`:tada: Thanks to ${!!screenName ? `@${screenName}` : author} for contributing! ${gi.goalEvent.sha.slice(0,8)} :rocket:`)
    },
);

export const shouldRebuildSite = pushTest(
    "shouldRebuildSite",
    async (pli: PushListenerInvocation) => {
        const changedFiles = await filesChangedSince(pli.project, pli.push);
        console.log(`shouldRebuildSite - changedFiles: ${JSON.stringify(changedFiles)}`);
        
        if (changedFiles?.length === 1 && changedFiles[0] === "README.md") {
            return false;
        }
        return true;
    },
);


export const isFluxSiteRepo = pushTest(
    "isFluxSiteRepo",
    async (pli: PushListenerInvocation) => {
        console.log(`isFluxSiteRepo pushTest: ${pli.push.repo?.owner}/${pli.push.repo?.name}`);
        return pli.push.repo?.owner === "voteflux" && pli.push.repo?.name === "flux-website-v2";
    },
);


// @ts-ignore TS6133
const shimLog = (log: WritableLog) => ({
    stripAnsi: true,
    write: (msg: string) => {
        console.log(`shimLog [${Date()}] ${msg}`);
        log.write(msg);
    }
})


type CheckStatsPs = Octokit.ChecksCreateParams & Octokit.RequestOptions;
const setGhCheckStatus = async (gh: Octokit, name: string, action: ProjectAwareGoalInvocation, status: CheckStatsPs["status"], 
                                conclusion: CheckStatsPs["conclusion"], startTS: Date, endTS?: Date, output?: CheckStatsPs["output"]) => {
    if (!isInLocalMode()) {
        return await gh.checks.create({
            head_sha: action.goalEvent.sha,
            name,
            repo: action.goalEvent.repo.name,
            owner: action.goalEvent.repo.owner,
            details_url: action.progressLog.url,
            external_id: action.context.correlationId,
            status,
            started_at: startTS.toISOString(),
            conclusion,
            completed_at: endTS?.toISOString(),
            output
        })
    }
    return null;
}


export const buildWebsite = goal(
    { displayName: "Build the Flux Website" },
    doWithProject(async (action: ProjectAwareGoalInvocation) => {
        const GH_ACTION_NAME = "jekyll-build";

        const ghToken = (action.credentials as TokenCredentials).token
        const gh = new Octokit({auth: `token ${ghToken}`});
        const startTS = new Date();
        await setGhCheckStatus(gh, GH_ACTION_NAME, action, "in_progress", undefined, startTS, );

        const collectStdOut = new StringCapturingProgressLog();
        const allLogs = new WriteToAllProgressLog(
            "flux-website-build", 
            new LoggingProgressLog('flux-website-build-logger', "info"),
            action.progressLog,
            addressChannelsProgressLog('flux-website-build-chat', {channels:[]}, action.context),
            collectStdOut,
        );

        const dockerBuildRes = await spawnPromise("docker", [" build", "-f", "./_docker-dev/Dockerfile", "-t", "flux-website-docker-dev:latest", "."], {cwd: action.project.baseDir, log: allLogs})
        const rNpmI = await spawnPromise("./dev-docker.sh", ["build"], {cwd: action.project.baseDir, log: allLogs})
        // var res = await action.spawn("./dev-docker.sh", ["build"], {cwd: action.project.baseDir, log: allLogs});

        console.log(`Docker Build status: ${dockerBuildRes.status}`);
        console.log(`Jekyll Build status: ${rNpmI.status}`);
        
        const endTS = new Date();
        const res = rNpmI;
        const didError = res.error || (res.status !== 0);

        // const gh = githubApi((action.credentials as TokenCredentials).token)
        await setGhCheckStatus(gh, GH_ACTION_NAME, action, "completed", didError ? "failure" : "success", startTS, endTS, 
        didError ? {
            title: `Jekyll Build Failed`,
            summary: res.error?.name || "No error name found",
            text: res.error?.message || "No error msg found"
        } : {
            title: `Jekyll Build Succeeded`,
            summary: collectStdOut.log.split('\n').reverse()[0],
            text: collectStdOut.log,
        });
        
        const logFileName = `jekyll-build-${Date.now()}-${action.goalEvent.sha.slice(0,8)}`;

        if (didError) {
            // magic string we print in `npm run build`
            const [preJekyllErr, jekyllErr] = collectStdOut.log.split('--JEKYLL-BUILD--');
            const errToSend = jekyllErr || preJekyllErr;
            
            await action.addressChannels({
                title: `Jekyll build failed; status: ${res.status}`,
                content: `JEKYLL BUILD ERROR:\n\n${errToSend}`,
                fileName: logFileName,
                fileType: `text`,
            })
        } else {
            await action.addressChannels({
                title: `Jekyll build succeeded!`,
                content: collectStdOut.log.split('\n').reverse().slice(0, 30).reverse().join('\n'),
                fileName: logFileName,
                fileType: `text`,
            })
        }
        
        return { code: res.status !== 0 ? (res.status || -1) : res.status } as ExecuteGoalResult; // { code: res.code }
    })
);


const mkCallerRef = () => `${Date.now()}`;


const deployWebsite = goal(
    { displayName: "Deploy Website Preview", uniqueName: "deploy-website-preview" },
    doWithProject(async (pa: ProjectAwareGoalInvocation) => {
        const shaFrag = pa.goalEvent.sha.slice(0,7);
        const cf = new AWS.CloudFront();
        const originId = `S3-preview-website-origin-${shaFrag}`;
        const origin = await cf.createCloudFrontOriginAccessIdentity({
            CloudFrontOriginAccessIdentityConfig: {CallerReference: mkCallerRef(), Comment: `S3-origin-preview-${shaFrag}`}
        })
        const distrib = await cf.createDistribution({
            DistributionConfig: {
                CallerReference: mkCallerRef(),
                Comment: `S3-flux-website-preview-${shaFrag}`,
                DefaultCacheBehavior: {
                    ForwardedValues: {
                        QueryString: false,
                        Cookies: {Forward: 'none'},
                    },
                    TargetOriginId: originId,
                    TrustedSigners: {
                        Enabled: false,
                        Quantity: 0
                    },
                    ViewerProtocolPolicy: "redirect-to-https",
                    MinTTL: 600,
                },
                Origins: {
                    Quantity: 1,
                    Items: [
                        { 
                            OriginPath: `/${shaFrag}/`,
                            DomainName: `preview.flx.dev.s3-website-ap-southeast-2.amazonaws.com`,
                            Id: originId,
                            S3OriginConfig: {
                                OriginAccessIdentity: "",
                            }// as AWS.CloudFront.S3OriginConfig
                        }// as AWS.CloudFront.Origin
                    ]
                },
                Enabled: true,
                // ViewerProtocolPolicy: "redirect-to-https"
            }
        }// as AWS.CloudFront.CreateDistributionRequest
        , (err, val) => {});
        // aws s3 sync _site/ s3://preview.flx.dev/test/ --acl public-read --expires $(expr $(date +%s) + $(expr 7 \* 86400))
        // aws configure set preview.cloudfront true && aws cloudfront create-invalidation --distribution-id <dist-id> --paths /index.html
    })
)

// const websitePrListener = 
