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
import { FluxGoals } from "./goals";
import {cacheRestore, cachePut, GoalCacheOptions} from "@atomist/sdm-core/lib/goal/cache/goalCaching";
import {NpmNodeModulesCachePut, NpmNodeModulesCacheRestore} from "@atomist/sdm-pack-node/lib/listener/npm";
import {isFlutterProject} from "./app/pushTests";
import {batchSpawn} from "../util/spawn";
import _ = require("lodash");
import {GoalWithFulfillment} from "@atomist/sdm";


const mkCacheFuncs = (classifier: string, cacheOpts?: Partial<GoalCacheOptions>, directory?: string) => {
    return {
        put: cachePut({
            entries: [{
                pattern: { directory: directory || classifier },
                classifier
            }],
            ...cacheOpts,
        }),
        restore: cacheRestore({
            entries: [{ classifier }],
            ...cacheOpts,
        }),
        classifier,
    }
};

const flutterPubCache = mkCacheFuncs("pub", {
    pushTest: isFlutterProject,
    onCacheMiss: [{
        name: "flutter packages get",
        listener: async (p, gi) => batchSpawn([
            ["flutter", ["packages", "get"], {cwd: p.baseDir, log: gi.progressLog}],
            ["flutter", ["precache"], {cwd: p.baseDir, log: gi.progressLog}],
        ]),
    }]
});
const jekyllCache = mkCacheFuncs("_site");


/**
 * Configure the SDM and add fulfillments or listeners to the created goals
 */
export const FluxGoalConfigurer: GoalConfigurer<FluxGoals> = async (sdm, goals) => {

    // app stuff

    _.mapValues(goals, (g: GoalWithFulfillment) => {
        if (_.has(g, 'withProjectListener')) {
            g.withProjectListener(flutterPubCache.put);
            g.withProjectListener(flutterPubCache.restore);
        }
    })
    // const { appAndroidBuild, appAndroidSign, appAndroidUpload, appDocs, appIosBuild, appIosSign, appIosUpload, appLint, appSetup, appIosTest, appAndroidTest } = goals;
    const {appAndroidBuild, appIosBuild} = goals;

    appIosBuild
        .withProjectListener(flutterPubCache.restore)
        .withProjectListener(flutterPubCache.put)

    appAndroidBuild
        .withProjectListener(flutterPubCache.restore)
        .withProjectListener(flutterPubCache.put)

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
