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
import {GitHubChecksListener} from "../listeners/GithubChecks";
import {buildWebsiteBuilder, makeCloudFrontDistribution, publishSitePreview, thankAuthorInChannelGoal} from "../machine";
import {snooze} from "../util";
import { FluxGoals } from "./goals";
import {goal} from "@atomist/sdm/lib/api/goal/GoalWithFulfillment";
import {logger} from "@atomist/automation-client/lib/util/logger";

const buildWebsite = new Build({ displayName: "Jekyll Build", uniqueName: "jekyll-build" }).with({
    name: "Jekyll",
    builder: buildWebsiteBuilder,
});

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
        appAndroidBuild: nopGoal,
        appAndroidSign: nopGoal,
        appAndroidUpload: nopGoal,
        appDocs: nopGoal,
        appIosBuild: nopGoal,
        appIosSign: nopGoal,
        appIosUpload: nopGoal,
        appLint: nopGoal,
        appSetup: nopGoal,
        appTest: nopGoal,
        siteBuild: buildWebsite.withExecutionListener(GitHubChecksListener),
        siteGenPreviewPng: nopGoalF(2000, "Generate Preview Screenshot Placeholder"),
        sitePushS3: publishSitePreview.withExecutionListener(GitHubChecksListener),
        siteDeployPreviewCloudFront: makeCloudFrontDistribution.withExecutionListener(GitHubChecksListener),
        msgAuthor: thankAuthorInChannelGoal,
    };
};
