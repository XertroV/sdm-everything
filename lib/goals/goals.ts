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

import {DeliveryGoals} from "@atomist/sdm-core/lib/machine/configure";
import {Build} from "@atomist/sdm-pack-build";
import {GoalWithFulfillment} from "@atomist/sdm/lib/api/goal/GoalWithFulfillment";
import {SdmGoalEvent} from "@atomist/sdm";
import {GoalInvocation} from "@atomist/sdm/lib/api/goal/GoalInvocation";
import {safeBranchDns} from "../util/github";

type DeliveryGoal = GoalWithFulfillment;


export const fluxSitePreviewBucket = "sdm-edgelambda-test4-public";
export const fluxSitePreviewBucketRegion = "us-east-1";
// export const fluxAppPreviewBucketRegion = "ap-southeast-2";
// export const fluxAppPreviewBucket = "sdm-edgelambda-test4-public";
export const fluxAppPreviewBucket = fluxSitePreviewBucket;
export const fluxAppPreviewBucketRegion = fluxSitePreviewBucket;
export const fluxPreviewDomain = "preview.flx.dev";

export function getPreviewStub(gi: GoalInvocation) {
    return safeBranchDns(gi.goalEvent.branch);
    // return gi.goalEvent.sha.slice(0, 7);
}

export const mkAppUploadFilename = (ge: SdmGoalEvent, ext: string): string =>
    `fluxApp-${ge.sha.slice(0, 7)}.${ext}`

/**
 * Interface to capture all goals that this SDM will manage
 */
export interface FluxGoals extends DeliveryGoals {
    nop: DeliveryGoal;

    /** Flux App Goals */
    appFlutterInfo: DeliveryGoal;
    appLint: DeliveryGoal;
    appDocs: DeliveryGoal;
    appAndroidTest: DeliveryGoal;
    appAndroidBuild: DeliveryGoal;
    appAndroidSign: DeliveryGoal;
    appAndroidReleaseUpload: DeliveryGoal;
    appAndroidUploadDebug: DeliveryGoal;
    appIosTest: DeliveryGoal;
    appIosBuild: DeliveryGoal;
    appIosSign: DeliveryGoal;
    appIosDebugUpload: DeliveryGoal;
    appIosReleaseUpload: DeliveryGoal;

    /** Flux Site Goals */
    siteBuild: Build;
    siteGenPreviewPng: DeliveryGoal;
    sitePushS3: GoalWithFulfillment;
    // sitePushS3Indexes: GoalWithFulfillment;
    // sitePushS3Indexes2: GoalWithFulfillment;
    siteDeployPreviewCloudFront: GoalWithFulfillment;
    siteDeployPreviewSetupCloudfront: GoalWithFulfillment;

    /** More general goals */
    // msgAuthor: GoalWithFulfillment;
}
