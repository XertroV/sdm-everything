import {SpawnOptions} from "child_process";
import {spawnLog, SpawnLogResult, StringCapturingProgressLog} from "@atomist/sdm";
import {jSz} from "./index";
import {logger} from "@atomist/automation-client";
import _ from "lodash/fp";

/**
 * The first two arguments to Node spawn
 */
export interface SpawnCommand {
    command: string;
    args?: string[];
    options?: any;
}

/**
 * Convenience function to create a spawn command from a string such
 * as "npm run compile". **Does not respect quoted arguments**.  Use
 * spawnAndWatch passing it the command and argument array if your
 * command arguments have spaces, etc.
 *
 * The function is unsafe because it does not respect quoted arguments.
 * Particularly: `fullCmd.split(" ")` is the main operation.
 *
 * @param {string} fullCmd command and argument string
 * @param options
 * @return {SpawnCommand}
 */
export function asUnsafeSpawnCommand(fullCmd: string, options: SpawnOptions = {}): SpawnCommand {
    if (fullCmd.includes("'") || fullCmd.includes('"')) {
        logger.warn(`asUnsafeSpawnCommand detected a quotation mark in the command! JSON encoded: ${JSON.stringify({fullCmd})}`)
    }
    const split = fullCmd.split(" ").filter(v => v !== '');
    return {
        command: split[0],
        args: split.slice(1),
        options,
    };
}


export type FunctionArgs<F> = F extends (...args: infer T) => any ? T : never;
export type SpawnLogArgs = FunctionArgs<typeof spawnLog>;
export type BatchSpawnLogArgs = [SpawnLogArgs[0], SpawnLogArgs[1], SpawnLogArgs[2]]


const renderMessages = (cmds: string[], msgs: string[], opts?: {alwaysShort?: boolean, addFence?: boolean}): string => {
    const final = _.flow(
        _.zip(cmds),
        _.map(([cmd, msg]) => `  >>running>>  ${cmd}\n\n${msg}`),
        _.join('\n\n')
    )(msgs);
    logger.info(`renderMessages produced output of length ${final.length}`);
    const fenceAddition = !!opts?.addFence ? "```\n" : ""
    // limit for GH status checks is 65535 bytes, and we want some leeway
    return [
        fenceAddition,
        (final.length >= (65535 * 0.9 | 0) || opts?.alwaysShort) ? `TRUNCATED -- SEE ATOMIST LOGS FOR FULL DETAILS.\n\n${final.slice(final.length - 2048)}` : final,
        fenceAddition
    ].join("");
}


export async function batchSpawn(spawns: BatchSpawnLogArgs[], batchOpts?: {truncateLog?: boolean, addFence?: boolean}) {
    let lastResult = { code: -1, message: "Empty array given to batchSpawn.", cmdString: "<empty>" } as SpawnLogResult;
    const messages = [];
    const commands = [];
    for (let i = 0; i < spawns.length; i++) {
        const next = spawns[i];
        if (next[0].includes(" ")) {
            logger.error(`Command given to batchSpawn has a space in it: ${next[0]}. This will likely fail.`)
        }
        logger.info(`///--(batch-${i}: ${next[0]} '${next[1].map(jSz).join("' '")}' )--`);
        // logger.info(`   -- env vars: ${JSON.stringify(next[2].env)}`);
        const opts = next[2];
        const log = _.getOr(new StringCapturingProgressLog(), 'log', opts);
        lastResult = await spawnLog(next[0], next[1], { ...opts, log});
        lastResult.message = log.log;
        messages.push(log.log || "<no retrievable logged output>");
        commands.push(lastResult.cmdString);
        logger.info(`\\\\\\--(batch-${i})--`);
        if (lastResult.code !== 0) {
            return {
                ...lastResult,
                message: renderMessages(commands, messages, {alwaysShort: batchOpts?.truncateLog, addFence: batchOpts?.addFence })
            };
        }
    }
    return {
        ...lastResult,
        message: renderMessages(commands, messages,{alwaysShort: batchOpts?.truncateLog, addFence: batchOpts?.addFence }),
        cmdString: commands.join("\n"),
    };
}
