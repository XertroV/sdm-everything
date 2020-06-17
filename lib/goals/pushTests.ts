import {pushTest} from "@atomist/sdm";

export const hasMarkdown = pushTest("hasMarkdown", async (p) => {
    return await p.project.getFiles("**/*.md").then(fs => fs.length > 0)
})
