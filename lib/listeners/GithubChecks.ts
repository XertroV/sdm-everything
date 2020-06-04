import {TokenCredentials} from "@atomist/automation-client";
import {
    GoalInvocation,
    GoalProjectListener,
    GoalProjectListenerEvent,
    GoalProjectListenerRegistration,
} from "@atomist/sdm";
import {isInLocalMode} from "@atomist/sdm-core";
import {Octokit} from "@octokit/rest";

export const mkGithubCheckOutput = (title: string, summary: string, text: string) => {
    return { title, summary, text };
};

type CheckStatsPs = Octokit.ChecksCreateParams & Octokit.RequestOptions;
export const setGhCheckStatus =
    async (gh: Octokit, name: string, gi: GoalInvocation, status: CheckStatsPs["status"],
           conclusion: CheckStatsPs["conclusion"], startTS: Date, endTS?: Date, output?: CheckStatsPs["output"]) => {
    if (isInLocalMode()) {
        return undefined;
    }
    return gh.checks.create({
        head_sha: gi.goalEvent.sha,
        name,
        repo: gi.goalEvent.repo.name,
        owner: gi.goalEvent.repo.owner,
        details_url: gi.progressLog.url,
        external_id: gi.context.correlationId,
        status,
        started_at: startTS.toISOString(),
        conclusion,
        completed_at: endTS?.toISOString(),
        output,
    });
};

export const GithubChecksListener: GoalProjectListener = async (project, gi, event) => {
    if (isInLocalMode()) {
        return { code: 0 };
    }

    const startTS = new Date();

    const ghToken = (gi.credentials as TokenCredentials).token;
    const gh = new Octokit({auth: `token ${ghToken}`});

    let out: {
        status: CheckStatsPs["status"],
        conclusion?: CheckStatsPs["conclusion"],
        output?: CheckStatsPs["output"],
    };
    if (event === GoalProjectListenerEvent.before) {
        out = {
            status: "in_progress",
        };
    } else {
        out = {
            status: "completed",
            conclusion: "success",
            output: mkGithubCheckOutput(`${gi.goal.name}`, `Completed ${gi.goal.name}`, gi.goalEvent.error || gi.goalEvent.),
        };
    }

    const endTS = new Date();
    await setGhCheckStatus(gh, gi.goal.name, gi, out.status, out.conclusion, startTS, endTS, out.output);

    return { code: 0 };
};

export const GithubChecks: GoalProjectListenerRegistration = {
    name: "publish github checks to reflect goal status",
    events: [GoalProjectListenerEvent.before, GoalProjectListenerEvent.after],
    listener: GithubChecksListener,
};
