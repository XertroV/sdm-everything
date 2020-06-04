import {TokenCredentials} from "@atomist/automation-client";
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
export const setGhCheckStatus =
    async (gh: Octokit, name: string, gi: GoalExecutionListenerInvocation, status: CheckStatsPs["status"],
           conclusion: CheckStatsPs["conclusion"], startTS: Date, endTS?: Date, output?: CheckStatsPs["output"]) => {
    if (isInLocalMode()) {
        return undefined;
    }

    return gh.checks.create({
        head_sha: gi.goalEvent.sha,
        name,
        repo: gi.goalEvent.repo.name,
        owner: gi.goalEvent.repo.owner,
        details_url: gi.goalEvent.url,
        external_id: gi.context.correlationId,
        status,
        started_at: startTS.toISOString(),
        conclusion,
        completed_at: endTS?.toISOString(),
        output,
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
    await setGhCheckStatus(gh, geli.goal.name, geli, out.status, out.conclusion, startTS, endTS, out.output);

    return { code: 0 };
};

// export const GithubChecks: GoalExecutionListenerInvocation = {
//     name: "publish github checks to reflect goal status",
//     events: [GoalProjectListenerEvent.before, GoalProjectListenerEvent.after],
//     listener: GithubChecksListener,
// };
