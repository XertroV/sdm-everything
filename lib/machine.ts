import { filesChangedSince, goal, GoalInvocation, PushListenerInvocation, pushTest, ProjectAwareGoalInvocation, doWithProject, executeGoal } from "@atomist/sdm";

export const msgGoal = goal(
    {
        displayName: "msgDisplayName",
    },
    async (gi: GoalInvocation) => {
        const author = gi.sdmGoal.push.commits?.map(el => el?.author?.name)[0];
        const thanksMsg = `Goal triggered, thanks ${author}`;
        console.log(thanksMsg);        
        await gi.addressChannels(thanksMsg)
    },
);

export const shouldRebuildSite = pushTest(
    "shouldRebuildSite",
    async (pli: PushListenerInvocation) => {
        const changedFiles = await filesChangedSince(pli.project, pli.push);
        console.log(`shouldRebuildSite - changedFiles: ${JSON.stringify(changedFiles)}`);
        
        if (changedFiles?.length === 1 && changedFiles[0] === "README.md") {
            return false;
        }
        return true;
    },
);


export const isFluxSiteRepo = pushTest(
    "isFluxSiteRepo",
    async (pli: PushListenerInvocation) => {
        console.log(`isFluxSiteRepo pushTest: ${pli.push.repo?.owner}/${pli.push.repo?.name}`);
        return pli.push.repo?.owner === "voteflux" && pli.push.repo?.name === "flux-website-v2";
    },
);



export const buildWebsite = goal(
    { displayName: "Build the Flux Website" },
    doWithProject(async (action: ProjectAwareGoalInvocation) => {
        var res = await action.spawn("jekyll", ["build"]);
        console.log(`Jekyll Build status: ${res.code}`);
        console.log(`Jekyll Build status: ${res.status}`);
        
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
        
        return { code: res.code }
    })
);

