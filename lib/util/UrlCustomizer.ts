import {GoalInvocation} from "@atomist/sdm/lib/api/goal/GoalInvocation";
import {UrlCustomizer} from "../aws/s3";


export interface SimpleUrlCustomizer {
    labelToReplace?: string;
    newLabel: string;
    mkUrl: (url: string, gi: GoalInvocation) => string;
}

/**
 * Produces a UrlCustomizer which replaces links with a matching label in externalUrls
 * @param labelToReplace Matching this label
 * @param newLabel Label to replace it with
 * @param mkUrl Function for generating new URL from previous URL and the GoalInvocation
 * @returns UrlCustomizer
 */
export function getSimpleUrlCustomizer({labelToReplace = "I_GET_REPLACED", newLabel, mkUrl}: SimpleUrlCustomizer): UrlCustomizer {
    return async (eus, gi) => !eus ? eus : eus.map(
        ({label, url}) => (!!label && label === labelToReplace) ? {
            label: newLabel,
            url: mkUrl(url, gi),
        } : {url}
    );
}
