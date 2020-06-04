import {SpawnOptions} from "child_process";

/**
 * The first two arguments to Node spawn
 */
export interface SpawnCommand {

    command: string;
    args?: string[];
    options?: any;
}

/**
 * Convenience function to create a spawn command from a sentence such
 * as "npm run compile" Does not respect quoted arguments.  Use
 * spawnAndWatch passing it the command and argument array if your
 * command arguments have spaces, etc.
 *
 * @param {string} sentence command and argument string
 * @param options
 * @return {SpawnCommand}
 */
export function asSpawnCommand(sentence: string, options: SpawnOptions = {}): SpawnCommand {
    const split = sentence.split(" ");
    return {
        command: split[0],
        args: split.slice(1),
        options,
    };
}
