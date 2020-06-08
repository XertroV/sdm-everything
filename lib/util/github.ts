import {
    ProjectOperationCredentials,
    TokenCredentials
} from "@atomist/automation-client/lib/operations/common/ProjectOperationCredentials";
import {Octokit} from "@octokit/rest";
import {isInLocalMode} from "@atomist/sdm-core";
import {
    GoalExecutionListenerInvocation,
    GoalInvocation,
    ProjectAwareGoalInvocation,
    SdmContext
} from "@atomist/sdm";
import {logger} from "@atomist/automation-client";
import {createTokenAuth} from "@octokit/auth";

type GHCredsParams = { credentials: ProjectOperationCredentials, __goalTag: false } | GoalInvocation | GoalExecutionListenerInvocation | ProjectAwareGoalInvocation | SdmContext;

export const getGitHubApi = async (gi: GHCredsParams): Promise<Octokit> => {
    if (isInLocalMode()) {
        // @ts-ignore
        const username = gi.configuration.sdmLocal.github.user;
        // @ts-ignore
        const token = gi.configuration.sdmLocal.github.token;
        logger.warn(`GITHUB API CREATED IN LOCAL MODE`);
        return new Octokit({auth: token, authStrategy: createTokenAuth});
    }
    const ghToken = (gi.credentials as TokenCredentials).token;
    return new Octokit({auth: `token ${ghToken}`});
};

export type GitHubPRCommentParams = Octokit.RequestOptions & Octokit.PullsCreateCommentParams;
