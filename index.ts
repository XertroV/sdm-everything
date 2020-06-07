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
import {CompressingGoalCache} from "@atomist/sdm-core/lib/goal/cache/CompressingGoalCache";
import {isInLocalMode} from "@atomist/sdm-core/lib/internal/machine/modes";
import {configure} from "@atomist/sdm-core/lib/machine/configure";

import * as os from "os";
import * as path from "path";

import {FluxGoalConfigurer} from "./lib/goals/goalConfigurer";
import {FluxGoalCreator} from "./lib/goals/goalCreator";
import {FluxGoals} from "./lib/goals/goals";
import {isFluxSiteRepo, shouldRebuildSite} from "./lib/machine";
import {logger} from "@atomist/automation-client/lib/util/logger";
import {githubGoalStatusSupport} from "@atomist/sdm-core";
// import {githubGoalStatusSupport} from "@atomist/sdm-core";
// import { githubLifecycleSupport } from "@atomist/sdm-pack-lifecycle-github";

process.env.AWS_SDK_LOAD_CONFIG = "1";
process.env.AWS_DEFAULT_REGION = "ap-southeast-2";
process.env.AWS_PROFILE = "flux";

/**
 * The main entry point into the SDM
 */
export const configuration = configure<FluxGoals>(async sdm => {
    if (isInLocalMode()) {
        logger.warn(`Config: ${JSON.stringify(sdm.configuration)}`);
        process.env.GITHUB_TOKEN = sdm.configuration.sdmLocal.github.token;
    }

    // sdm.configuration
    sdm.configuration.sdm.cache = {
        enabled: true,
        path: path.join(os.homedir(), ".atomist", "cache"),
        store: new CompressingGoalCache(),
    };

    sdm.addExtensionPacks(
        // githubLifecycleSupport(),
        githubGoalStatusSupport(),
    );

    // Use the sdm instance to configure commands etc
    sdm.addCommand({
        name: "FluxCommand",
        description: "Command that responds with a 'Go Flux!'",
        intent: "hello",
        listener: async ci => {
            await ci.addressChannels("Go Flux!");
        },
    });

    const goals = await sdm.createGoals(FluxGoalCreator, [FluxGoalConfigurer]);
    return {
        nop: {
            goals: [goals.nop]
        },
        fluxApp: {
            goals: [
                goals.appFlutterInfo,
                [goals.nop, goals.appAndroidTest],
                goals.appAndroidBuild,
                goals.appAndroidSign,
                goals.appAndroidUpload,
            ]
        },
        fluxSite: {
            test: [
                isFluxSiteRepo,
                shouldRebuildSite,
            ],
            goals: [
                goals.nop,
                [goals.msgAuthor, goals.siteBuild],
                [goals.siteGenPreviewPng, goals.sitePushS3],
                goals.siteDeployPreviewCloudFront,
            ],
        },
    };
});
