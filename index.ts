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
import * as path from 'path';
import * as os from 'os';

 import { configure, CompressingGoalCache } from "@atomist/sdm-core";
import { HelloWorldGoals } from "./lib/goals/goals";
import {isFluxSiteRepo, msgGoal, shouldRebuildSite, buildWebsite} from "./lib/machine";

/**
 * The main entry point into the SDM
 */
export const configuration = configure<HelloWorldGoals>(async sdm => {

    sdm.configuration.sdm.cache = {
        enabled: true,
        path: path.join(os.homedir(), ".atomist", "cache"),
        store: new CompressingGoalCache()
    }

    // Use the sdm instance to configure commands etc
    sdm.addCommand({
        name: "HelloWorld",
        description: "Command that responds with a 'hello world'",
        intent: "flux-hello",
        listener: async ci => {
            await ci.addressChannels("Hello World");
        },
    });

    // Create goals and configure them
    // const goals = await sdm.createGoals(HelloWorldGoalCreator, [HelloWorldGoalConfigurer]);
    // console.log(goals);

    // Return all push rules
    return {
        // hello: {
        //     test: AnyPush,
        //     goals: goals.helloWorld,
        // },
        // testMsg: {
        //     test: [],
        //     goals: [],
        // },
        websiteBuild: {
            test: [
                isFluxSiteRepo,
                shouldRebuildSite
            ],
            goals: [
                msgGoal,
                buildWebsite,
            ],
        },
    };
});
