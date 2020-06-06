import {GoalProjectListenerEvent, GoalProjectListenerRegistration} from "@atomist/sdm";

export function outputCacheListnerF(): GoalProjectListenerRegistration {
    return {
        name: "",
        listener: async (pli) => {
            return {code: 0};
        },
        events: [GoalProjectListenerEvent.after],
    }
    // return async (gitProject: GitProject,
    //               goalInvocation: GoalInvocation,
    //               event: GoalProjectListenerEvent): Promise<void | ExecuteGoalResult> => {};
}
