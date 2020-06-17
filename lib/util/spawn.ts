import {SpawnOptions} from "child_process";
import {spawnLog, SpawnLogResult} from "@atomist/sdm";
import {jSz} from "./index";
import {logger} from "@atomist/automation-client";

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


type FunctionArgs<F> = F extends (...args: infer T) => any ? T : never;
type SpawnLogArgs = FunctionArgs<typeof spawnLog>;


export async function batchSpawn(spawns: SpawnLogArgs[]) {
    let lastResult = { code: -1, message: "Empty array given to batchSpawn.", cmdString: "<empty>" } as SpawnLogResult;
    const commands = [];
    for (let i = 0; i < spawns.length; i++) {
        const next = spawns[i];
        if (next[0].includes(" ")) {
            logger.error(`Command given to batchSpawn has a space in it: ${next[0]}. This will likely fail.`)
        }
        logger.info(`///--(batch-${i}: ${next[0]} '${next[1].map(jSz).join("' '")}' )--`);
        // await spawnLog("echo", [`///--(batch-${i}: ${next[0]} '${next[1].map(jSz).join("' '")}' )--`], next[2]);
        lastResult = await spawnLog(...(next));
        // await spawnLog("echo", [`\\\\\\--(batch-${i})--`], next[2]);
        logger.info(`\\\\\\--(batch-${i})--`);
        if (lastResult.code !== 0) {
            return lastResult;
        }
        commands.push(lastResult.cmdString)
    }
    return {
        ...lastResult,
        cmdString: commands.join("\n"),
    };
}
