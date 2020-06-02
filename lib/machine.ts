import { filesChangedSince, goal, GoalInvocation, PushListenerInvocation, pushTest, ProjectAwareGoalInvocation, doWithProject } from "@atomist/sdm";

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
    async (pli: PushListenerInvocation) => {
        return pli.push.repo?.org === "voteflux" && pli.push.repo?.name === "flux-website-v2";
    },
);

export const buildWebsite = goal(
    { displayName: "Build the Flux Website" },
    async (gi: GoalInvocation) => {
        doWithProject(async (action: ProjectAwareGoalInvocation) => {
            var res = await action.spawn("jekyll build");
            if (res.code !== 0) {
                await action.addressChannels({
                    text: `--stdout:--\n\n${res.stdout}\n\n--stderr:--\n\n${res.stderr}`,
                    fileName: `jekyll-build-${Date.now()}`,
                    fileType: `txt`,
                    title: `Jekyll build failed; status: ${res.code}`
                })
            } else {
                await action.addressChannels({
                    title: `Jekyll build succeeded!`,
                    text: res.stdout,
                    fileName: `jekyll-build-${Date.now()}`,
                    fileType: `txt`,
                })
            }
        })
    },
);

