import {
    ProjectOperationCredentials,
    TokenCredentials
} from "@atomist/automation-client/lib/operations/common/ProjectOperationCredentials";
import {Octokit} from "@octokit/rest";
import {isInLocalMode} from "@atomist/sdm-core";
import { Base64 } from 'js-base64';
import {GoalInvocation} from "@atomist/sdm";

export const getGitHubApi = (gi: { credentials: ProjectOperationCredentials } | GoalInvocation): Octokit => {
    if (isInLocalMode()) {
        // @ts-ignore
        const userPass = `${gi.configuration.sdmLocal.user}:${gi.configuration.sdmLocal.token}`
        new Octokit({auth: `Basic ${Base64.encode(userPass)}`});
    }
    const ghToken = (gi.credentials as TokenCredentials).token;
    return new Octokit({auth: `token ${ghToken}`});
};

export type GitHubPRCommentParams = Octokit.RequestOptions & Octokit.PullsCreateCommentParams;
