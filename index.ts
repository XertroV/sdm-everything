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
import {AutomationEventListener} from "@atomist/automation-client/lib/server/AutomationEventListener";

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
import _ from "lodash/fp";
import {hasMarkdown} from "./lib/goals/pushTests";
import {doAppRelease} from "./lib/commands/appRelease";

process.env.AWS_SDK_LOAD_CONFIG = "1";
process.env.AWS_DEFAULT_REGION = "ap-southeast-2";
process.env.AWS_PROFILE = process.env.AWS_PROFILE || "sdm-flux-s3";


/* Which SDM to start? Keep declarations in order of priority till refactored. */


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
    _.set('sdm.rolar.bufferSize', 1024, sdm.configuration);
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

    // sdm.addTagListener

    // Commands, should be runable by any b/c we won't rely on tools here.
    sdm.addCommand(doAppRelease(sdm));

    const verifyIos = () => verifyAws()
    const verifyAndroid = () => !!process.env.ANDROID_SDK_ROOT && verifyAws()
    const verifyAws = () => !!process.env.AWS_PROFILE || !!process.env.AWS_ACCESS_KEY_ID

    const choices: Record<string, [Record<string, GoalStructure>, () => boolean]> = {
        "ios": [{
            fluxAppIos: {
                test: [isFlutterProject],
                goals: [
                    goals.appFlutterInfo,
                    goals.appIosBuild,
                    [goals.appIosUploadDebug, goals.appIosTest],
                ]
            },
        }, verifyIos],
        "android": [{
            fluxAppAndroid: {
                test: [
                    isFlutterProject
                ],
                goals: [
                    goals.appFlutterInfo,
                    goals.appAndroidBuild,
                    [goals.appAndroidTest, goals.appAndroidUploadDebug],
                    // goals.appAndroidSign,
                ]
            },
        }, verifyAndroid],
        "aws": [{
            fluxSite: {
                test: [
                    isFluxSiteRepo,
                    shouldRebuildSite,
                ],
                goals: [
                    // [goals.siteSpellcheck, goals.siteBuild],
                    [goals.sitePushS3],
                    // [goals.siteGenPreviewPng, goals.sitePushS3],
                    // goals.siteDeployPreviewCloudFront,
                ],
            },
            markdownSpellchecker: {
                test: [
                    hasMarkdown
                ],
                goals: [
                    // goals.siteSpellcheck
                ]
            }
        }, verifyAws]
    }

    const usageError = () => {
        throw Error(`Setup must match one of the provided SDM configurations.

Valid options for env var SDM_FLUX_CHOICE: ${JSON.stringify(_.keys(choices), null, 2)}

See index.ts for more.`);
    };

    const nonemptyListOr = <T>(xs: Array<T>, def: () => Array<T>): Array<T> => {
        if (xs.length === 0) {
            return def();
        }
        return xs
    }

    const processChoiceEnv = (): string[] => !process.env.SDM_FLUX_CHOICE
        ? usageError()
        : process.env.SDM_FLUX_CHOICE === "all"
            ? _.keys(choices)
            : nonemptyListOr(process.env.SDM_FLUX_CHOICE.split(",").filter(v => _.keys(choices).includes(v)), usageError);

    // const cs: Record<string, Record<string, GoalStructure>> = ;
    //_.map(_.get(0), choices);
    const res = _.flow(
        _.map((c: string) => choices[c]),
        _.map(([c, pred]) => {
            if (!pred()) {
                throw Error(`Predicate for SDM with goals ${_.keys(c)} failed.`);
            }
            return c;
        }),
        _.reduce((acc, v) => ({...acc, ...v}), {} as Record<string, GoalStructure>)
    )(processChoiceEnv())
    return res;
}

const mkConfiguration = () => {
    // note: must be in same order as configurations returned in configurer above
    const name = `sdm-flux-${process.env.SDM_FLUX_CHOICE}`;
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
