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

import { GoalConfigurer } from "@atomist/sdm-core";
import {GitHubChecksListener} from "../listeners/GithubChecks";
// import {GitHubChecksListener} from "../listeners/GithubChecks";
import { FluxGoals } from "./goals";

/**
 * Configure the SDM and add fulfillments or listeners to the created goals
 */
export const FluxGoalConfigurer: GoalConfigurer<FluxGoals> = async (sdm, goals) => {

    // This is a good place to configure your SDM instance and goals with additional listeners or
    // fulfillments

    // goals.app.with({
    //     name: "hello-world",
    //     goalExecutor: async gi => {
    //         const { progressLog, addressChannels } = gi;
    //
    //         progressLog.write("Sending 'hello world' to all linked channels");
    //         await addressChannels("Hello world");
    //     },
    // });

    goals.appTest.withExecutionListener(GitHubChecksListener);
};
