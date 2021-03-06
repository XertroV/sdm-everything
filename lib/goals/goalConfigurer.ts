/*
 * Copyright © 2019 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {GoalConfigurer} from "@atomist/sdm-core/lib/machine/configure";
import {
    GitHubChecksListener,
} from "../listeners/GithubChecks";
import {FluxGoals, fluxPreviewDomain, mkAppUploadFilename} from "./goals";
// import {NpmNodeModulesCachePut, NpmNodeModulesCacheRestore} from "@atomist/sdm-pack-node/lib/listener/npm";
import {isFlutterProject} from "./app/pushTests";
import {batchSpawn} from "../util/spawn";
import {mkCacheFuncs} from "../utils/cache";
// @ts-ignore
import {doWithProject, GoalExecutionListener, GoalProjectListenerEvent, SdmGoalState, spawnLog} from "@atomist/sdm";
import {addCommentToRelevantPR, getGitHubApi} from "../util/github";
import {logger} from "@atomist/automation-client";

/**
 * App Cache stuff
 */

/* todo: can we do this bit better/well? Use PUB_CACHE to set cache location */
/* NOTE: *NOT* currently used, broken */
export const flutterPubCache = mkCacheFuncs("flutter-pub-cache", {
    pushTest: isFlutterProject,
    onCacheMiss: [{
        name: "flutter packages get",
        listener: async (p, gi) => {
            const opts = {cwd: p.baseDir, log: gi.progressLog, env: { ...process.env, /* PUB_CACHE: p.baseDir */ }};
            await batchSpawn([
                ["mkdir", ["-p", ".pub-cache"], opts],
                ["flutter", ["precache"], opts],
                ["flutter", ["packages", "get"], opts],
                // ["flutter", ["pub", "cache", "repair"], opts],
            ], {truncateLog: true, addFence: true});
        },
    }]
}, ".pub-cache");

const flutterReleaseApkCache = mkCacheFuncs("flutter-build-apk-release", {
    pushTest: isFlutterProject,
}, "build/app/outputs/apk/release/");
const flutterDebugApkCache = mkCacheFuncs("flutter-build-apk-debug", {
    pushTest: isFlutterProject,
}, "build/app/outputs/apk/debug/");

const flutterReleaseIpaCache = mkCacheFuncs("flutter-build-ipa-release", {
    pushTest: isFlutterProject,
}, "ios/build/");
const flutterDebugIpaCache = mkCacheFuncs("flutter-build-ipa-debug", {
    pushTest: isFlutterProject,
}, "ios/build/");



/**
 * Cache funcs for jekyll build outputs (i.e. _site)
 */
const jekyllCache = mkCacheFuncs("_site", {}, "_site");
const elmStuffCache = mkCacheFuncs("elm-stuff", {}, "elm-stuff");
const npmCache = mkCacheFuncs("node_modules", {}, "node_modules");


/**
 * Some app stuff
 */


const osToAppExtension = {
    "android": "apk",  // "aab" (I think..)
    "android-appbundle": "aab",
    "ios": "ipa"
}

type AppBuildForOs = keyof typeof osToAppExtension;

// const flutterAndroidUploadDebugGithubPRComment: GoalExecutionListener = async (gi): Promise<void> => {
//     if (gi.goalEvent.state !== "success") {
//         return;
//     }
//     const fname = mkAppUploadFilename(gi.goalEvent, 'apk');
//     const body = `### Build outputs for ${gi.id.sha}
//
// * Debug APK: <http://${fluxAppPreviewBucket}.s3.amazonaws.com/android/${fname}>
// <!-- * S3 Link: <http://${fluxAppPreviewBucket}.s3.amazonaws.com/android/fluxApp-latest.apk> -->
//
// :tada:`;
//     await gi.addressChannels(`Flux App Debug Build for ${gi.id.sha?.slice(0, 7)}: http://${fluxAppPreviewBucket}.s3.amazonaws.com/android/${fname}`);
//     const gh = await getGitHubApi(gi);
//     await addCommentToRelevantPR(gi, gh, body);
// };


const flutterUploadDebugGithubPRComment = (_os: AppBuildForOs): GoalExecutionListener => async (gi): Promise<void> => {
    const ext = osToAppExtension[_os];
    if (gi.goalEvent.state !== "success") {
        return;
    }
    const fname = mkAppUploadFilename(gi.goalEvent, ext);
    const body = `### Build outputs for ${gi.id.sha}

* Debug ${ext.toUpperCase()}: <http://${_os}.${fluxPreviewDomain}/${fname}>

:tada:`;
    const shaStub = gi.id.sha?.slice(0, 7);
    await gi.addressChannels(`Flux App Debug Build for ${shaStub}: <http://${_os}.${fluxPreviewDomain}/${fname}>`);
    const gh = await getGitHubApi(gi);
    await addCommentToRelevantPR(gi, gh, body);
};

const flutterAndroidUploadDebugGithubPRComment: GoalExecutionListener = flutterUploadDebugGithubPRComment("android");
const flutterIosUploadDebugGithubPRComment: GoalExecutionListener = flutterUploadDebugGithubPRComment("ios");


/**
 * Website Goal Config data
 */


const DeployPreviewPRComment: GoalExecutionListener = async (gi): Promise<void> => {
    if (gi.goalEvent.state !== "success") {
        return;
    }

    // if (!gi.result?.externalUrls) {
    //     throw new Error("no external urls provided, cannot make github comment")
    // }

    // logger.warn(`deploy preview goal event (should have state:success): ${JSON.stringify(gi.goalEvent)}`)

    const shaStub = gi.id.sha?.slice(0, 7);
    const renderedMdUrls = gi.result?.externalUrls?.map(eu => `* ${eu.label || eu.url} <${eu.url}>`).join("\n");
    const renderedSlackUrls = gi.result?.externalUrls?.map(eu => `* <${eu.url}|${eu.label || eu.url}>`).join("\n");

    logger.debug(`renderedMdUrls: ${renderedMdUrls}`);
    logger.debug(JSON.stringify(gi.result?.externalUrls));
    logger.debug(JSON.stringify(gi.result));

    const body = `### Deploy Preview for branch ${gi.goalEvent.branch}
    
#### Commit: ${shaStub}

${renderedMdUrls}

:tada:`;
    await gi.addressChannels(`Deploy Preview for branch ${gi.goalEvent.branch}, commit: ${shaStub}:\n\n${renderedSlackUrls}`);
    const gh = await getGitHubApi(gi);
    await addCommentToRelevantPR(gi, gh, body);
};


/**
 * Configure the SDM and add fulfillments or listeners to the created goals
 */
export const FluxGoalConfigurer: GoalConfigurer<FluxGoals> = async (sdm, goals) => {

    // app stuff
    // _.mapValues(goals, (g: GoalWithFulfillment) => {
    //     if (_.has(g, 'withProjectListener')) {
    //         g.withProjectListener(flutterPubCache.put);
    //         g.withProjectListener(flutterPubCache.restore);
    //     }
    // })

    // goals.appFlutterInfo
    //     .withExecutionListener(flutterAndroidUploadDebugGithubPRComment);

    goals.appFlutterInfo
        .withExecutionListener(GitHubChecksListener)

    // flutter pub cache
    /* [appIosBuild, appAndroidBuild, appIosTest, appAndroidTest].map(goal => {
        goal
            .withProjectListener(flutterPubCache.restore)
            .withProjectListener(flutterPubCache.put)
    }); */
    goals.appAndroidBuild
        .withExecutionListener(GitHubChecksListener)
        .withProjectListener(flutterDebugApkCache.put)
    goals.appIosBuild
        .withExecutionListener(GitHubChecksListener)
        .withProjectListener(flutterDebugIpaCache.put)

    goals.appAndroidSign
        .withExecutionListener(GitHubChecksListener)
        .withProjectListener(flutterReleaseApkCache.restore)
        .withProjectListener(flutterReleaseApkCache.put);
    goals.appIosSign
        .withExecutionListener(GitHubChecksListener)
        .withProjectListener(flutterReleaseIpaCache.restore)
        .withProjectListener(flutterReleaseIpaCache.put);

    goals.appAndroidUploadDebug
        .withExecutionListener(GitHubChecksListener)
        .withProjectListener(flutterDebugApkCache.restore)
        .withExecutionListener(flutterAndroidUploadDebugGithubPRComment);
    goals.appIosUploadDebug
        .withExecutionListener(GitHubChecksListener)
        .withProjectListener(flutterDebugIpaCache.restore)
        .withExecutionListener(flutterIosUploadDebugGithubPRComment);


    // website stuff
    const { siteBuild, siteDeployPreviewCloudFront, siteGenPreviewPng, sitePushS3 } = goals;

    siteBuild
        .withExecutionListener(GitHubChecksListener)
        .withProjectListener(npmCache.put)
        .withProjectListener(npmCache.restore)
        .withProjectListener(elmStuffCache.put)
        .withProjectListener(elmStuffCache.restore)
        .withProjectListener(jekyllCache.put);

    sitePushS3
        .withExecutionListener(GitHubChecksListener)
        .withProjectListener(jekyllCache.restore)
        .withExecutionListener(DeployPreviewPRComment);
    // goals.sitePushS3Indexes
    //     // .withExecutionListener(GitHubChecksListener)
    //     .withProjectListener(jekyllCache.restore);
    // goals.sitePushS3Indexes2
    //     // .withExecutionListener(GitHubChecksListener)
    //     .withProjectListener(jekyllCache.restore);

    siteGenPreviewPng.withExecutionListener(GitHubChecksListener);
    siteDeployPreviewCloudFront.withExecutionListener(GitHubChecksListener);

    goals.siteSpellcheck.withExecutionListener(GitHubChecksListener);

    logger.info("Finished setting up goal configuration.");
};


/*

        .withProjectListener({listener: async (p, plgi) => {
            const startTS = new Date();
            // plgi.context.graphClient<>;
            const checkLog = (n=30): any => {
                console.warn(`checkLog running...`);
                return GitHubChecksListenerFull({outputMsgF: async (geli) => ({
                        ...(geli.goalEvent.state === SdmGoalState.in_process
                            ? {
                                status: "in_progress",
                                startTS,
                                output: mkGithubCheckOutput(geli.goal.name, `In Progressini: ${geli.goal.name}`, `\`\`\`\n${plgi.progressLog.log}\n\`\`\``),
                        } : { ...(await mkGHChecksOutDefault(geli)), output: mkGithubCheckOutput(geli.goal.name, `Doneskies: ${geli.goal.name}`, `\`\`\`\n${plgi.progressLog.log}\n\`\`\``) }),
                        ...({name: `${plgi.goal.name}-testing-live`}),
                    })})(plgi).then(async () => {
                    if ([SdmGoalState.in_process].includes(plgi.goalEvent.state)) {
                        await snooze(3000);
                        return await checkLog(n-1)
                    }
                })
            };
            new Promise((res, rej) => { checkLog().then(res).catch(rej) });
        }, events: [GoalProjectListenerEvent.before], name: 'githubProgressLog'})
 */
