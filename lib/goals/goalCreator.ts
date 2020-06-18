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

import {GoalCreator} from "@atomist/sdm-core/lib/machine/configure";
import {Build} from "@atomist/sdm-pack-build";
import {buildWebsiteBuilder, makeCloudFrontDistribution} from "../machine";
import {snooze} from "../util";
import {
    FluxGoals,
    fluxSitePreviewBucketRegion,
    fluxPreviewDomain,
    fluxSitePreviewBucket,
    getPreviewStub,
    mkAppUploadFilename
} from "./goals";
import {goal, GoalWithFulfillment} from "@atomist/sdm/lib/api/goal/GoalWithFulfillment";
import {logger} from "@atomist/automation-client/lib/util/logger";
import {asUnsafeSpawnCommand, batchSpawn} from "../util/spawn";
import {and} from "@atomist/sdm/lib/api/mapping/support/pushTestUtils";
import {
    doWithProject,
    pushTest as mkPushTest,
    PushTest,
    SpawnLogOptions, StringCapturingProgressLog
} from "@atomist/sdm";
import {PublishToS3} from "@atomist/sdm-pack-s3";
import {GoalInvocation} from "@atomist/sdm/lib/api/goal/GoalInvocation";
import {PublishToS3IndexShimsAndUrlCustomizer} from "../aws/s3";


/**
 * PushTest that always returns true.
 */
export const ptTrue: PushTest = mkPushTest("always True", async () => true);
export const ptFalse: PushTest = mkPushTest("always False", async () => false);


/**
 * [cmd, args, Opts?]
 */
type SpawnEntry = [string, string[], SpawnLogOptions] | [string, string[]];

const flutterEnv = {
    JAVA_HOME: process.env.JAVA_HOME,
    PATH: process.env.PATH, // `${process.env.HOME}/flutter/bin:${process.env.PATH}`,
    ANDROID_SDK_ROOT: process.env.ANDROID_SDK_ROOT, // `${process.env.HOME}/Android/Sdk`,
    ANDROID_HOME: process.env.ANDROID_SDK_ROOT,
}

/**
 * Convenience function to keep app goals consistent.
 * @param displayName The display name of the goal
 * @param spawns The commands to run, in series
 * @param restrictRepoOwners Optional list of allowed owners
 * @param restrictRepoNames Optional list of allowed repo names
 */
const appGoalF = (
    displayName: string,
    spawns: SpawnEntry[],
    restrictRepoOwners: string[] | null = ["voteflux", "xertrov"],
    restrictRepoNames: string[] | null = ["voting_app"],
): GoalWithFulfillment => {
    const pushTest = and(
        restrictRepoOwners !== null ? async gi => restrictRepoOwners.includes(gi.id.owner.toLowerCase()) : ptTrue,
        restrictRepoNames !== null ? async gi => ["voting_app"].includes(gi.id.repo) : ptTrue,
    );
    return goal({
        displayName
    }, doWithProject(async pagi => {
        const env = {...flutterEnv, /* PUB_CACHE: `${pagi.project.baseDir}` */ };
        // logging, env vars, and working dir
        const opts: SpawnLogOptions = {log: pagi.progressLog, cwd: pagi.project.baseDir};
        // await spawnLog("mkdir", ["-p", ".pub-cache"], opts);
        // compose the commands to run, mixing in opts.
        const result = await batchSpawn(spawns.map(
            // merge in user-provided opts with the progress log, env vars, etc.
            ([cmd, args = [], otherOpts = {}]) => ([cmd, args, {
                ...(opts),
                ...(otherOpts),
                env: {...env, ...(otherOpts?.env || {}), /* PUB_CACHE: env.PUB_CACHE */ },
            }])
        ));
        logger.info(`appGoalF returning code ${result.code} with message:\n\n${result.message}`);
        return result;
    }), {pushTest});
};

const appFlutterInfo = appGoalF("Flutter-Info", [
    ["bash", ["-c", "set >~/atm-env-$(date +%s)"]],
    ["flutter", ["--version"]],
    ["flutter", ["doctor", "-v"]],
])
const appAndroidTest = appGoalF("Flutter-Android-Test", [
    // ["env", []],
    // ["pwd", []],
    // ["ls", ["-al"]],
    ["flutter", ["precache"]],
    ["flutter", ["packages", "get"]],
    ["flutter", ["test"]]
]);
const appAndroidBuild: GoalWithFulfillment = appGoalF("Flutter-Android-Build", [
    // ["env", []],
    // ["pwd", []],
    ["flutter", ["precache"]],
    ["flutter", ["packages", "get"]],
    // ["flutter", ["clean"]],
    ["flutter", ["build", "apk", "--debug"]],
    ["cp", ["build/app/outputs/apk/debug/app-debug.apk", "build/app/outputs/apk/debug/fluxApp-latest-build.apk"]],
    ["ls", ["-al", "build/app/outputs/apk/debug/"]],
    ["ls", ["-al", "build/app/outputs/apk/"]],
])
const appAndroidSign: GoalWithFulfillment = appGoalF("Flutter-Android-Sign", [
    ["ls", ["-al", "build/app/outputs/apk/debug/"]],
    ["ls", ["-al", "build/app/outputs/apk/"]],
]);

const appIosBuild = appGoalF("Flutter-Ios-Build", [
    ["flutter", ["precache"]],
    ["flutter", ["packages", "get"]],
    // ["flutter", ["clean"]],
    ["./ci/manual-build-alt-macos.sh", []],
])
const appIosTest = appGoalF("Flutter-Ios-Test", [
    ["flutter", ["precache"]],
    ["flutter", ["packages", "get"]],
    // ["flutter", ["clean"]],
    ["flutter", ["test"]],
])


const appAndroidUploadDebug = new PublishToS3({
    displayName: "Flutter-Android-Debug-Upload",
    uniqueName: "flutter-android-debug-upload-s3",
    bucketName: fluxSitePreviewBucket,
    region: fluxSitePreviewBucketRegion, // use your region
    filesToPublish: ["build/app/outputs/apk/debug/app-debug.apk", "build/app/outputs/apk/debug/fluxApp-latest-build.apk"], // , "build/app/outputs/apk/debug/app-debug.aab"],
    pathTranslation: (filepath: string, gi: GoalInvocation) => {
        return filepath
            .replace(/^build\/app\/outputs\/apk\/debug/, "android")
            .replace(/app-debug.apk/, mkAppUploadFilename(gi.goalEvent, 'apk'))
    },
    // pathToIndex: `android/fluxApp-latest-build.apk`, // index file in your project
    linkLabel: "Download APK",
});


const appIosUploadDebug = new PublishToS3({
    displayName: "Flutter-Ios-Debug-Upload",
    uniqueName: "flutter-ios-debug-upload-s3",
    bucketName: fluxSitePreviewBucket,
    region: fluxSitePreviewBucketRegion,
    filesToPublish: ["ios/build/*.ipa"],
    pathTranslation: (filepath: string, gi: GoalInvocation) => {
        return filepath
            .replace(/^ios\/build/, "ios")
            .replace(/Runner\.ipa/, mkAppUploadFilename(gi.goalEvent, 'ipa'))
    },
    // pathToIndex: `ios/fluxApp-latest.ipa}`, // index file in your project
    linkLabel: "Download IPA",
});


/**
 * Website Goals
 */


// Build event for site
const buildWebsite = new Build({displayName: "Jekyll Build"}).with({
    name: "Jekyll",
    builder: buildWebsiteBuilder,
    // progressReporter: () => {}
});

type SpellCheckOpts = {
    lang: "en-us" | "en-gb" | "en-au" | "es-es",
    filesGlob: string | string[],
    ignoreNumbers: boolean,
    ignoreAcronyms: boolean
};
const spellCheckMarkdown = (opts: Partial<SpellCheckOpts>) => goal({
    displayName: "Spellcheck",
    uniqueName: "spellcheck"
}, doWithProject(async (pagi) => {
    const _opts = {
        ...({
            lang: "en-us",
            filesGlob: ["**/*.md"],
            ignoreNumbers: true,
            ignoreAcronyms: true,
        }),
        ...opts
    };
    const mdspellArgs = [
        ...(_opts.ignoreAcronyms ? ['-a'] : []),
        ...(_opts.ignoreNumbers ? ['-n'] : []),
        `--${_opts.lang}`,
        `--report`,
        Array.isArray(_opts.filesGlob) ? _opts.filesGlob.join(' ') : _opts.filesGlob
    ].join(' ')
    const progressLog = new StringCapturingProgressLog();
    const toRun = asUnsafeSpawnCommand([
            `docker run --rm -v ${pagi.project.baseDir}:/workdir`,
            `tmaier/markdown-spellcheck:latest`,
            mdspellArgs
        ].join(' ')
    );
    const spellcheckRes = await pagi.spawn(toRun.command, toRun.args, {...toRun.options, log: progressLog});
    const outputLines = progressLog.log.split('\n');
    const output = ["To fix spelling mistakes, use `mdspell`.",
        "", "* Install: `npm i markdown-spellcheck -g`",
        `* Run: \`mdspell ${mdspellArgs}\``,
        `* Hint: add exclusionary globs like \`'!node_modules/**/*'\` if you need to exclude some files or directories.`,
        "",
        ...outputLines
    ].join('\n');
    // this is left
    spellcheckRes.message = output;
    // logger.info(`Spellcheck Result: ${JSON.stringify(spellcheckRes)}`);
    return spellcheckRes
}))


const publishSitePreview = new PublishToS3IndexShimsAndUrlCustomizer({
    displayName: "Publish to S3",
    uniqueName: "publish-preview-to-s3",
    bucketName: fluxSitePreviewBucket,
    region: fluxSitePreviewBucketRegion, // use your region
    filesToPublish: ["_site/**/*"],
    pathTranslation: (filepath: string, gi: GoalInvocation) => filepath.replace(/^_site/, `${getPreviewStub(gi)}`),
    pathToIndex: "_site/index.html", // index file in your project
    linkLabel: "S3OutputLink",
    urlCustomizer: async (eus, gi) => !eus ? eus : eus.map(
        ({label, url}) => (!!label && label === "S3OutputLink") ? {
            label: "Deployment Preview",
            url: `https://${gi.goalEvent.branch}.${fluxPreviewDomain}/`
        } : {url}
    ),
});

// const publishSitePreviewIndexes = new PublishToS3({
//     displayName: "Publish to S3 (indexes shim)",
//     uniqueName: "publish-preview-indexes-to-s3",
//     bucketName: fluxSitePreviewBucket,
//     region: fluxSitePreviewBucketRegion, // use your region
//     filesToPublish: ["_site/**/index.html"],
//     pathTranslation: (filepath: string, gi: GoalInvocation) =>
//         filepath
//             .replace('index.html', '')
//             .replace(/^_site/, `${getPreviewStub(gi)}`),
//     pathToIndex: "_site/index.html", // index file in your project
// });
//
// const publishSitePreviewIndexes2 = new PublishToS3({
//     displayName: "Publish to S3 (indexes2 shim)",
//     uniqueName: "publish-preview-indexes2-to-s3",
//     bucketName: fluxSitePreviewBucket,
//     region: fluxSitePreviewBucketRegion, // use your region
//     filesToPublish: ["_site/**/index.html"],
//     pathTranslation: (filepath: string, gi: GoalInvocation) =>
//         filepath
//             .replace('/index.html', '')
//             .replace(/^_site/, `${(getPreviewStub(gi))}`),
//     pathToIndex: "_site/index.html", // index file in your project
// });

/**
 * Create all goal instances and return an instance of FluxGoals
 */
export const FluxGoalCreator: GoalCreator<FluxGoals> = async sdm => {
    // This is the place to create the goal instances and return them
    // as part of the goal interface

    const nopGoalF = (ms: number = 200, displayName: string = "NOP Goal - placeholder") => goal({displayName}, async (gi) => {
        logger.info(`NOP Goal (${displayName}) waiting for (${ms}) ms`);
        await snooze(ms);
    });

    const nopGoal = nopGoalF();

    return {
        nop: nopGoal,
        /* app goals */
        appFlutterInfo,
        appAndroidBuild,
        appAndroidSign,
        appAndroidTest,
        appAndroidUploadDebug,
        appAndroidReleaseUpload: nopGoal,
        appDocs: nopGoal,
        appIosBuild,
        appIosSign: nopGoal,
        appIosUploadDebug,
        appIosReleaseUpload: nopGoal,
        appIosTest,
        appLint: nopGoal,
        appSetup: nopGoal,
        /* website goals */
        siteBuild: buildWebsite,
        siteGenPreviewPng: nopGoalF(2000, "Generate Preview Screenshot Placeholder"),
        siteSpellcheck: spellCheckMarkdown({lang: "en-au"}),
        sitePushS3: publishSitePreview,
        // sitePushS3Indexes: publishSitePreviewIndexes,
        // sitePushS3Indexes2: publishSitePreviewIndexes2,
        siteDeployPreviewCloudFront: makeCloudFrontDistribution,
        siteDeployPreviewSetupCloudfront: makeCloudFrontDistribution,
        // msgAuthor: thankAuthorInChannelGoal,
    };
};
