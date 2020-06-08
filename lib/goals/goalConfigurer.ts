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
import {GitHubChecksListener} from "../listeners/GithubChecks";
import {FluxGoals} from "./goals";
import {NpmNodeModulesCachePut, NpmNodeModulesCacheRestore} from "@atomist/sdm-pack-node/lib/listener/npm";
import {isFlutterProject} from "./app/pushTests";
import {batchSpawn} from "../util/spawn";
import {mkCacheFuncs} from "../utils/cache";

/* todo: can we do this bit better/well? Use PUB_CACHE to set cache location */
export const flutterPubCache = mkCacheFuncs("flutter-pub-cache", {
    pushTest: isFlutterProject,
    onCacheMiss: [{
        name: "flutter packages get",
        listener: async (p, gi) => {
            const opts = {cwd: p.baseDir, log: gi.progressLog, env: { ...process.env, PUB_CACHE: p.baseDir }};
            await batchSpawn([
                ["mkdir", ["-p", ".pub-cache"], opts],
                ["flutter", ["precache"], opts],
                ["flutter", ["packages", "get"], opts],
                // ["flutter", ["pub", "cache", "repair"], opts],
            ]);
        },
    }]
}, ".pub-cache");

const flutterReleaseApkCache = mkCacheFuncs("flutter-build-apk-release", {
    pushTest: isFlutterProject,
}, "build/app/outputs/apk/release/app-release.apk");
const flutterDebugApkCache = mkCacheFuncs("flutter-build-apk-debug", {
    pushTest: isFlutterProject,
}, "build/app/outputs/apk/debug/app-debug.apk");

const flutterReleaseIpaCache = mkCacheFuncs("flutter-build-ipa-release", {
    pushTest: isFlutterProject,
}, "ios/build/Runner.ipa");
const flutterDebugIpaCache = mkCacheFuncs("flutter-build-ipa-debug", {
    pushTest: isFlutterProject,
}, "ios/build/Runner.ipa");

const jekyllCache = mkCacheFuncs("_site");


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

    // const { appAndroidBuild, appAndroidSign, appAndroidUpload, appDocs, appIosBuild, appIosSign, appIosUpload, appLint, appSetup, appIosTest, appAndroidTest } = goals;
    const {appAndroidBuild, appIosBuild, appIosTest, appAndroidTest, appIosSign, appAndroidSign} = goals;

    // flutter pub cache
    [appIosBuild, appAndroidBuild, appIosTest, appAndroidTest].map(goal => {
        goal
            .withProjectListener(flutterPubCache.restore)
            .withProjectListener(flutterPubCache.put)
    });
    appAndroidBuild
        .withProjectListener(flutterDebugApkCache.put)
    appIosBuild
        .withProjectListener(flutterDebugIpaCache.put)

    appAndroidSign
        .withProjectListener(flutterReleaseApkCache.put);
    appIosSign
        .withProjectListener(flutterReleaseIpaCache.put);

    // website stuff
    const { siteBuild, siteDeployPreviewCloudFront, siteGenPreviewPng, sitePushS3 } = goals;

    siteBuild
        .withExecutionListener(GitHubChecksListener)
        .withProjectListener(NpmNodeModulesCacheRestore)
        .withProjectListener(NpmNodeModulesCachePut)
        .withProjectListener(jekyllCache.put);

    sitePushS3.withExecutionListener(GitHubChecksListener)
        .withProjectListener(jekyllCache.restore);

    siteGenPreviewPng.withExecutionListener(GitHubChecksListener);
    siteDeployPreviewCloudFront.withExecutionListener(GitHubChecksListener);
};
