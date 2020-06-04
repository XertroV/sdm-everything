import {logger, TokenCredentials} from "@atomist/automation-client";
import {
    GoalExecutionListener,
    GoalExecutionListenerInvocation,
    // GoalInvocation,
    // GoalProjectListener,
    // GoalProjectListenerEvent,
    // GoalProjectListenerRegistration,
} from "@atomist/sdm";
import {isInLocalMode} from "@atomist/sdm-core";
import {SdmGoalState} from "@atomist/sdm/lib/typings/types";
import {Octokit} from "@octokit/rest";

export const mkGithubCheckOutput = (title: string, summary: string, text: string) => {
    return { title, summary, text };
};

type CheckStatsPs = Octokit.ChecksCreateParams & Octokit.RequestOptions;

interface GhCheckStatusOpts {
    gh: Octokit;
    name: string;
    gi: GoalExecutionListenerInvocation;
    status: CheckStatsPs["status"];
    conclusion: CheckStatsPs["conclusion"];
    startTS: Date;
    endTS?: Date;
    output?: CheckStatsPs["output"];
}

export const setGhCheckStatus =
    async ({gh, name, gi, status, conclusion, startTS, endTS, output}: GhCheckStatusOpts) => {
    if (isInLocalMode()) {
        logger.warn(`(Local mode) Skipping GitHub check: ${name}. New status: ${status}. Conclusion: ${conclusion}`);
        return undefined;
    }

    // if we include conclusion:undefined in the params object we'll get a validation error.
    const extraParamsAtEnd = status === "completed" ? {
        completed_at: endTS?.toISOString(),
        conclusion,
    } : {};

    return gh.checks.create({
        head_sha: gi.goalEvent.sha,
        name,
        repo: gi.goalEvent.repo.name,
        owner: gi.goalEvent.repo.owner,
        details_url: gi.goalEvent.url,
        external_id: gi.context.correlationId,
        status,
        started_at: startTS.toISOString(),
        output,
        ...extraParamsAtEnd,
    });
};

export const GithubChecksListener: GoalExecutionListener = async (geli: GoalExecutionListenerInvocation) => {
    if (isInLocalMode()) {
        return { code: 0 };
    }

    const startTS = new Date();

    const ghToken = (geli.credentials as TokenCredentials).token;
    const gh = new Octokit({auth: `token ${ghToken}`});

    let out: {
        status: CheckStatsPs["status"],
        conclusion?: CheckStatsPs["conclusion"],
        output?: CheckStatsPs["output"],
    };
    if (geli.goalEvent.state === SdmGoalState.in_process) {
        out = {
            status: "in_progress",
            conclusion: "neutral",
        };
    } else {
        const conclusion = geli.result?.code !== 0 ? "failure" : "success";
        out = {
            status: "completed",
            conclusion,
            output: mkGithubCheckOutput(`${geli.goal.name}`, `Completed ${geli.goal.name}: ${conclusion}`,
                geli.goalEvent.error || `Error: ${geli.error?.name}: ${geli.error?.message}` || geli.result?.message || "Not provided: event.error or result.message"),
        };
    }

    const endTS = new Date();
    await setGhCheckStatus({
        gh,
        name: geli.goal.name,
        gi: geli,
        status: out.status,
        conclusion: out.conclusion || undefined,
        startTS,
        endTS,
        output: out.output,
    });

    return { code: 0 };
};

// export const GithubChecks: GoalExecutionListenerInvocation = {
//     name: "publish github checks to reflect goal status",
//     events: [GoalProjectListenerEvent.before, GoalProjectListenerEvent.after],
//     listener: GithubChecksListener,
// };
