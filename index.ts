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
import {configure, ConfigureMachineOptions, Configurer, GoalStructure} from "@atomist/sdm-core/lib/machine/configure";
import { AutomationEventListener } from "@atomist/automation-client/lib/server/AutomationEventListener";

import * as os from "os";
import * as path from "path";

import {FluxGoalConfigurer} from "./lib/goals/goalConfigurer";
import {FluxGoalCreator} from "./lib/goals/goalCreator";
import {FluxGoals} from "./lib/goals/goals";
import {isFluxSiteRepo, shouldRebuildSite} from "./lib/machine";
import {logger} from "@atomist/automation-client/lib/util/logger";
// import {githubGoalStatusSupport} from "@atomist/sdm-core";
// import { githubLifecycleSupport } from "@atomist/sdm-pack-lifecycle-github";
import {isFlutterProject} from "./lib/goals/app/pushTests";
import {
    CommandIncoming, EventIncoming,
    RequestProcessor
} from "@atomist/automation-client/lib/internal/transport/RequestProcessor";
import {AutomationClient} from "@atomist/automation-client/lib/automationClient";
import {HandlerContext} from "@atomist/automation-client/lib/HandlerContext";
import {CommandInvocation} from "@atomist/automation-client/lib/internal/invoker/Payload";
import {HandlerResult} from "@atomist/automation-client/lib/HandlerResult";
import {EventFired} from "@atomist/automation-client/lib/HandleEvent";
import {Destination, MessageOptions} from "@atomist/automation-client/lib/spi/message/MessageClient";

process.env.AWS_SDK_LOAD_CONFIG = "1";
process.env.AWS_DEFAULT_REGION = "ap-southeast-2";
process.env.AWS_PROFILE = process.env.AWS_PROFILE || "sdm-flux-s3";


/* Which SDM to start? Keep declarations in order of priority till refactored. */

const isIosSdm = process.env.SDM_FLUX_APP_IOS === "true" && process.platform === "darwin";
const isAndroidSdm = process.env.SDM_FLUX_APP_ANDROID === "true";
const isAwsSdm = process.env.SDM_FLUX_CHOICE === "aws";


export class TestAutomationEventListener implements AutomationEventListener {

    public registrationSuccessful(handler: RequestProcessor) {
        // This is intentionally left empty
    }

    public startupSuccessful(client: AutomationClient): Promise<void> {
        return Promise.resolve();
    }

    public contextCreated(context: HandlerContext) {
        // This is intentionally left empty
    }

    public commandIncoming(payload: CommandIncoming) {
        // This is intentionally left empty
    }

    public commandStarting(payload: CommandInvocation, ctx: HandlerContext) {
        // This is intentionally left empty
    }

    public commandSuccessful(payload: CommandInvocation, ctx: HandlerContext, result: HandlerResult): Promise<void> {
        return Promise.resolve();
    }

    public commandFailed(payload: CommandInvocation, ctx: HandlerContext, err: any): Promise<void> {
        return Promise.resolve();
    }

    public eventIncoming(payload: EventIncoming) {
        // This is intentionally left empty
    }

    public eventStarting(payload: EventFired<any>, ctx: HandlerContext) {
        // This is intentionally left empty
    }

    public eventSuccessful(payload: EventFired<any>, ctx: HandlerContext, result: HandlerResult[]): Promise<void> {
        return Promise.resolve();
    }

    public eventFailed(payload: EventFired<any>, ctx: HandlerContext, err: any): Promise<void> {
        return Promise.resolve();
    }

    public messageSending(message: any,
                          destinations: Destination | Destination[],
                          options: MessageOptions,
                          ctx: HandlerContext): Promise<{ message: any, destinations: Destination | Destination[], options: MessageOptions }> {
        return Promise.resolve({
            message,
            destinations,
            options,
        });
    }

    public messageSent(message: any,
                       destinations: Destination | Destination[],
                       options: MessageOptions,
                       ctx: HandlerContext): Promise<void> {
        // logger.warn(`Sent slack message: ${_.keys(message)}...`);
        return Promise.resolve();
    }
}

const configurer: Configurer<FluxGoals> = async (sdm): Promise<Record<string, GoalStructure>> => {
    const goals = await sdm.createGoals(FluxGoalCreator, [FluxGoalConfigurer]);

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
        // githubGoalStatusSupport(),
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

    if (!sdm.configuration.listeners) {
        sdm.configuration.listeners = [];
    }
    sdm.configuration.listeners.push(
        new TestAutomationEventListener()
    );

    if (isIosSdm) {
        return {
            fluxAppIos: {
                test: [isFlutterProject],
                goals: [
                    goals.appFlutterInfo,
                    goals.appIosBuild,
                    [goals.appIosDebugUpload, goals.appIosTest],
                ]
            },
        }
    }

    if (isAndroidSdm) {
        return {
            fluxAppAndroid: {
                test: [
                    isFlutterProject
                ],
                goals: [
                    goals.appFlutterInfo,
                    goals.appAndroidBuild,
                    [goals.appAndroidUploadDebug, goals.appAndroidTest],
                    // goals.appAndroidSign,
                ]
            },
        }
    }

    if (isAwsSdm) {
        return {
            fluxSite: {
                test: [
                    isFluxSiteRepo,
                    shouldRebuildSite,
                ],
                goals: [
                    [goals.msgAuthor, goals.siteBuild],
                    [goals.siteGenPreviewPng, goals.sitePushS3, goals.sitePushS3Indexes, goals.sitePushS3Indexes2],
                    // goals.siteDeployPreviewCloudFront,
                ],
            },
        }
    }

    throw Error("Setup must match one of the provided SDM configurations. See index.ts for more.");
}

const mkConfiguration = () => {
    // note: must be in same order as configurations returned in configurer above
    const name = isIosSdm ? "sdm-flux-ios-build"
        : isAndroidSdm ?
            "sdm-flux-android-build"
            : (isAwsSdm) ?
                "sdm-flux-aws"
                : (() => { throw Error('No SDM configuration selected.'); })();

    const options: ConfigureMachineOptions = {
        preProcessors: [
            async (opts) => {
                console.warn(`Current name: ${opts.name}, new: ${name}`);
                opts.name = name;
                opts.version = `${opts.version}-${Date.now().toString()}`;
                return opts;
            }
        ],
        // name,
    };

    return configure<FluxGoals>(configurer, options);
}



/**
 * The main entry point into the SDM
 */
export const configuration = mkConfiguration();
