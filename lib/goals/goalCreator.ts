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
import {buildWebsiteBuilder, makeCloudFrontDistribution, publishSitePreview, thankAuthorInChannelGoal} from "../machine";
import {snooze} from "../util";
import { FluxGoals } from "./goals";
import {goal, GoalWithFulfillment} from "@atomist/sdm/lib/api/goal/GoalWithFulfillment";
import {logger} from "@atomist/automation-client/lib/util/logger";
import {batchSpawn} from "../util/spawn";
import {and} from "@atomist/sdm/lib/api/mapping/support/pushTestUtils";
import {doWithProject, pushTest as mkPushTest, PushTest, spawnLog, SpawnLogOptions} from "@atomist/sdm";

const buildWebsite = new Build({ displayName: "Jekyll Build" }).with({
    name: "Jekyll",
    builder: buildWebsiteBuilder,
});


/**
 * PushTest that always returns true.
 */
const ptTrue: PushTest = mkPushTest("always True", async () => true);
const ptFalse: PushTest = mkPushTest("always False", async () => false);


/**
 * [cmd, args, Opts?]
 */
type SpawnEntry = [string, string[], SpawnLogOptions] | [string, string[]];

const flutterEnv = {
    JAVA_HOME: process.env.JAVA_HOME,
    PATH: process.env.PATH, // `${process.env.HOME}/flutter/bin:${process.env.PATH}`,
    ANDROID_SDK_ROOT: process.env.ANDROID_SDK_PATH, // `${process.env.HOME}/Android/Sdk`,
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
    const env = flutterEnv;
    const pushTest = and(
        restrictRepoOwners !== null ? async gi => restrictRepoOwners.includes(gi.id.owner.toLowerCase()) : ptTrue,
        restrictRepoNames !== null ? async gi => ["voting_app"].includes(gi.id.repo) : ptTrue,
    );
    return goal({
        displayName
    }, doWithProject(async pagi => {
        // logging, env vars, and working dir
        const opts: SpawnLogOptions = { log: pagi.progressLog, env, cwd: pagi.project.baseDir };
        await spawnLog("mkdir", ["-p", ".pub-cache"], opts);
        // compose the commands to run, mixing in opts.
        return await batchSpawn(spawns.map(
            // merge in user-provided opts with the progress log, env vars, etc.
            ([cmd, args=[], otherOpts={}]) => ([cmd, args, {
                ...(opts),
                ...(otherOpts),
                env: { ...(opts.env), ...(otherOpts?.env || {}), PUB_CACHE: `${pagi.project.baseDir}` }
            }])
        ));
    }), { pushTest });
};

const appFlutterInfo = appGoalF("Flutter-Info", [
    ["flutter", ["--version"]],
    ["flutter", ["doctor", "-v"]],
])
const appAndroidUpload = appGoalF("Flutter-Android-Upload", []);
const appAndroidTest = appGoalF("Flutter-Android-Test", [
    ["env", []],
    ["pwd", []],
    ["ls", ["-al"]],
    ["flutter", ["packages", "get"]],
    ["flutter", ["test"]]
]);
const appAndroidBuild: GoalWithFulfillment = appGoalF("Flutter-Android-Build", [
    ["flutter", ["packages", "get"]],
    ["flutter", ["clean"]],
    ["flutter", ["build", "apk", "--debug"]],
])
const appAndroidSign: GoalWithFulfillment = appGoalF("Flutter-Android-Sign", [
    ["echo", ["placeholder", "appAndroidSign"]]
]);


/**
 * Create all goal instances and return an instance of FluxGoals
 */
export const FluxGoalCreator: GoalCreator<FluxGoals> = async sdm => {
    // This is the place to create the goal instances and return them
    // as part of the goal interface

    const nopGoalF = (ms: number = 200, displayName: string = "NOP Goal - placeholder") => goal({displayName}, async (gi) => {
        logger.info(`NOP Goal (${displayName}) waiting for (${ms}) ms`);
        await snooze(ms);
    }, {pushTest: ptFalse});

    const nopGoal = nopGoalF();

    return {
        nop: nopGoal,
        appFlutterInfo,
        appAndroidBuild,
        appAndroidSign,
        appAndroidUpload,
        appAndroidTest,
        appDocs: nopGoal,
        appIosBuild: nopGoal,
        appIosSign: nopGoal,
        appIosUpload: nopGoal,
        appIosTest: nopGoal,
        appLint: nopGoal,
        appSetup: nopGoal,
        siteBuild: buildWebsite,
        siteGenPreviewPng: nopGoalF(2000, "Generate Preview Screenshot Placeholder"),
        sitePushS3: publishSitePreview,
        siteDeployPreviewCloudFront: makeCloudFrontDistribution,
        msgAuthor: thankAuthorInChannelGoal,
    };
};
