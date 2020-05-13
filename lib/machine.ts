import {filesChangedSince, goal, GoalInvocation, PushListenerInvocation, pushTest} from "@atomist/sdm";
import {  } from "@atomist/sdm-pack-docker";

export const msgGoal = goal(
    {
        displayName: "msgDisplayName",
    },
    async (gi: GoalInvocation) => {
        console.log("gots me a goal", gi);
    },
);

export const shouldRebuildSite = pushTest(
    "shouldRebuildSite",
    async (pli: PushListenerInvocation) => {
        const changedFiles = await filesChangedSince(pli.project, pli.push);
        if (changedFiles?.length === 1 && changedFiles[0] === "README.md") {
            return false;
        }
        return true;
    },
);

export const isFluxSiteRepo = pushTest(
    "isFluxSiteRepo",
    async pli => {
        return pli.push.repo?.org === "voteflux" && pli.push.repo.name === "flux-website-v2";
    },
);

export const buildWebsite = goal(
    { displayName: "Build the Flux Website" },
    async gi => {

    }
);

