import {logger} from "@atomist/automation-client/lib/util/logger";
import {isInLocalMode} from "@atomist/sdm-core/lib/internal/machine/modes";
import {SdmGoalState} from "@atomist/sdm-core/lib/typings/types";
import {GoalExecutionListener, GoalExecutionListenerInvocation} from "@atomist/sdm/lib/api/listener/GoalStatusListener";
import {get} from "lodash";

import {Octokit} from "@octokit/rest";
import {getGitHubApi} from "../util/github";

export const mkGithubCheckOutput = (title: string, summary: string, text?: string) => {
    return { title, summary, text };
};

type CheckStatsPs = Octokit.ChecksCreateParams & Octokit.RequestOptions;

interface GhCheckStatusOpts {
    name: string;
    gi: GoalExecutionListenerInvocation;
    status: CheckStatsPs["status"];
    startTS: Date;
    conclusion?: CheckStatsPs["conclusion"];
    endTS?: Date;
    output?: CheckStatsPs["output"];
}

export const setGhCheckStatus =
    async ({name, gi, status, conclusion, startTS, endTS, output, ...remainder}: GhCheckStatusOpts) => {
        const gh = await getGitHubApi(gi);

        if (isInLocalMode()) {
            logger.warn(`(Local mode) Skipping GitHub check: ${name}. New status: ${status}. Conclusion: ${conclusion}`);
            return undefined;
        }

        // if we include conclusion:undefined in the params object we'll get a validation error.
        const extraParamsAtEnd = status === "completed" ? {
            completed_at: endTS?.toISOString(),
            conclusion,
            ...(!!output ? {output} : {}),  // ahh, hacks. because ofc 'a' is in {a: undefined} but not in {}, even tho obj.a === undefined for both.
        } : {};

        return gh.checks.create({
            ...remainder,
            head_sha: gi.goalEvent.sha,
            name,
            repo: gi.goalEvent.repo.name,
            owner: gi.goalEvent.repo.owner,
            details_url: get(gi.goalEvent.externalUrls, 0, gi.goalEvent).url,
            external_id: gi.context.correlationId,
            status,
            started_at: startTS.toISOString(),
            ...extraParamsAtEnd,
        });
};

export const GitHubChecksListener: GoalExecutionListener = async (geli: GoalExecutionListenerInvocation) => {
    if (isInLocalMode()) {
        return { code: 0 };
    }

    const startTS = new Date();

    let out: {
        status: CheckStatsPs["status"],
        conclusion?: CheckStatsPs["conclusion"],
        output?: CheckStatsPs["output"],
    } & Partial<Octokit.ChecksUpdateParams>;
    if (geli.goalEvent.state === SdmGoalState.in_process) {
        out = {
            status: "in_progress",

        };
    } else {
        const conclusion = geli.result?.code !== 0 ? "failure" : "success";
        const errorObjMessage = !!geli.error ? `Error: ${geli.error?.name}: ${geli.error?.message}` : undefined;
        const detailsUrlSpread = geli.result?.externalUrls ? { details_url: geli.result?.externalUrls[0].url } : {};
        out = {
            status: "completed",
            conclusion,
            output: mkGithubCheckOutput(`${geli.goal.name}`, `Completed ${geli.goal.name}: ${conclusion}`,
                geli.goalEvent.error || geli.result?.message || errorObjMessage),
            ...detailsUrlSpread,
        };
    }

    const endTS = new Date();
    await setGhCheckStatus({
        name: geli.goal.name,
        gi: geli,
        startTS,
        endTS,
        ...out,
    });

    return { code: 0 };
};

// export const GithubChecks: GoalExecutionListenerInvocation = {
//     name: "publish github checks to reflect goal status",
//     events: [GoalProjectListenerEvent.before, GoalProjectListenerEvent.after],
//     listener: GithubChecksListener,
// };
