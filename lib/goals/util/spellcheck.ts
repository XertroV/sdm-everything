import {goal} from "@atomist/sdm/lib/api/goal/GoalWithFulfillment";
import {doWithProject, StringCapturingProgressLog} from "@atomist/sdm";
import {asUnsafeSpawnCommand} from "../../util/spawn";

export type SpellCheckOpts = {
    lang: "en-us" | "en-gb" | "en-au" | "es-es",
    filesGlob: string | string[],
    ignoreNumbers: boolean,
    ignoreAcronyms: boolean
};
export const spellCheckMarkdown = (opts: Partial<SpellCheckOpts>) => goal({
    displayName: "Spellcheck",
    uniqueName: "spellcheck"
}, doWithProject(async (pagi) => {
    const _opts = {
        ...({
            lang: "en-us",
            filesGlob: ["**/*.md"],
            ignoreNumbers: true,
            ignoreAcronyms: true,
        }),
        ...opts
    };
    const mdspellArgs = [
        ...(_opts.ignoreAcronyms ? ['-a'] : []),
        ...(_opts.ignoreNumbers ? ['-n'] : []),
        `--${_opts.lang}`,
        `--report`,
        Array.isArray(_opts.filesGlob) ? _opts.filesGlob.join(' ') : _opts.filesGlob
    ].join(' ')
    const progressLog = new StringCapturingProgressLog();
    const toRun = asUnsafeSpawnCommand([
            `docker run --rm -v ${pagi.project.baseDir}:/workdir`,
            `tmaier/markdown-spellcheck:latest`,
            mdspellArgs
        ].join(' ')
    );
    const spellcheckRes = await pagi.spawn(toRun.command, toRun.args, {...toRun.options, log: progressLog});
    const outputLines = progressLog.log.split('\n');
    const output = ["To fix spelling mistakes, use `mdspell`.",
        "", "* Install: `npm i markdown-spellcheck -g`",
        `* Run: \`mdspell ${mdspellArgs}\``,
        `* Hint: add exclusionary globs like \`'!node_modules/**/*'\` if you need to exclude some files or directories.`,
        "",
        ...outputLines
    ].join('\n');
    // this is left
    spellcheckRes.message = output;
    // logger.info(`Spellcheck Result: ${JSON.stringify(spellcheckRes)}`);
    return spellcheckRes
}))
