import {logger} from "@atomist/automation-client/lib/util/logger";
import {isInLocalMode} from "@atomist/sdm-core/lib/internal/machine/modes";
import {GoalExecutionListener, GoalExecutionListenerInvocation} from "@atomist/sdm/lib/api/listener/GoalStatusListener";

import {Octokit} from "@octokit/rest";
import {getGitHubApi} from "../util/github";
import {ProgressLog, SdmGoalState} from "@atomist/sdm";

type MkGitHubCheckOutputResponse = { title: string, summary: string, text?: string };

export const mkGithubCheckOutput = (title: string, summary: string, text?: string): MkGitHubCheckOutputResponse => {
    return {title, summary, text};
};

type CheckStatsPs = Octokit.ChecksCreateParams & Octokit.RequestOptions;

interface GhCheckStatusOpts {
    name: string;
    gi: GoalExecutionListenerInvocation;
    status: CheckStatsPs["status"];
    startTS?: Date;
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

        const extraParamsStartTs = !!startTS ? {started_at: startTS.toISOString()} : {};

        // if we include conclusion:undefined in the params object we'll get a validation error.
        const extraParamsAtEnd = status === "completed" ? {
            completed_at: endTS?.toISOString(),
            conclusion,
            details_url: gi.goalEvent.url,
            ...(!!output ? {output} : {}),  // ahh, hacks. because ofc 'a' is in {a: undefined} but not in {}, even tho obj.a === undefined for both.
        } : {};

        return gh.checks.create({
            ...remainder,
            head_sha: gi.goalEvent.sha,
            name,
            repo: gi.goalEvent.repo.name,
            owner: gi.goalEvent.repo.owner,
            external_id: gi.context.correlationId,
            status,
            details_url: gi.goalEvent.url,
            ...extraParamsStartTs,
            ...extraParamsAtEnd,
        });
    };

export const githubChecksLogsPassthrough: Partial<ProgressLog> = {
    write: async (log) => {
    }
}


export type GHChecksListenerOutTy = {
    status: CheckStatsPs["status"],
    conclusion?: CheckStatsPs["conclusion"],
    output?: CheckStatsPs["output"],
} & Partial<GhCheckStatusOpts>;


export type GitHubChecksListenerFullArgs = {
    outputMsgF?: (geli: GoalExecutionListenerInvocation) => Promise<GHChecksListenerOutTy>;
}


// @ts-ignore
const testRender = (geli: GoalExecutionListenerInvocation) => {
    try {
        return JSON.stringify({
            ...geli,
            context: null,
            goal: null,
            configuration: null,
            credentials: null,
            preferences: null,
            addressChannels: null
        })
    } catch (e) {
        return "Failed to stringify with " + e.toString();
    }
}


export function replaceBadStdoutValues(output: string): string | undefined {
    if ([
        "See log\n"
    ].includes(output)) {
        return undefined;
    }
    return output;
}


export async function mkGHChecksOutDefault(geli: GoalExecutionListenerInvocation): Promise<GHChecksListenerOutTy> {
    if (geli.goalEvent.state === SdmGoalState.in_process) {
        return {
            status: "in_progress",
            startTS: new Date(),
        };
    } else {
        const conclusion = geli.result?.code !== 0 ? "failure" : "success";
        const errorObjMessage = !!geli.error ? `## Error!\n\n### \`error.name\`: ${geli.error?.name}        

#### \`error.message\`\n\n${geli.error?.message}\n\n#### \`goalEvent.error\`\n\n${geli.goalEvent.error}

#### \`result.message\`\n\n${geli.result?.message}` : undefined;
        const detailsUrlSpread = geli.result?.externalUrls ? {details_url: geli.result?.externalUrls[0].url} : {};
        const result: any = geli.result;
        const fullSummary = `### Output:

\`\`\`
${result?.message || '<No output from goal>' /* JSON.stringify(summaryJson, null, 2).replace(/\\n/g, '\n') */}
\`\`\`
`;
        const origSummary = `Completed ${geli.goal.name}: ${conclusion}\n\n${geli.result?.message || "(no result.message)"}`;
        // logger.info(`Full summary for github check: ${fullSummary}`)
        const output = mkGithubCheckOutput(`${geli.goal.name}`, origSummary, errorObjMessage || fullSummary);
        return {
            status: "completed",
            conclusion,
            output,
            endTS: new Date(),
            ...detailsUrlSpread,
        };
    }
}

export const GitHubChecksListenerFull = ({outputMsgF}: GitHubChecksListenerFullArgs): GoalExecutionListener => async (geli: GoalExecutionListenerInvocation) => {
    if (isInLocalMode()) {
        return {code: 0};
    }

    const out: GHChecksListenerOutTy = await (!!outputMsgF ? outputMsgF(geli) : mkGHChecksOutDefault(geli));

    await setGhCheckStatus({
        name: geli.goal.name,
        gi: geli,
        ...out,
    });

    return {code: 0};
};


export const GitHubChecksListener = GitHubChecksListenerFull({});


// export const GithubChecks: GoalExecutionListenerInvocation = {
//     name: "publish github checks to reflect goal status",
//     events: [GoalProjectListenerEvent.before, GoalProjectListenerEvent.after],
//     listener: GithubChecksListener,
// };
