import {cachePut, cacheRestore, GoalCacheOptions} from "@atomist/sdm-core/lib/goal/cache/goalCaching";

export const mkCacheFuncs = (classifier: string, cacheOpts: Partial<Omit<GoalCacheOptions, "entries">> = {}, directory?: string) => {
    return {
        put: cachePut({
            entries: [{
                pattern: {directory: directory || classifier},
                classifier
            }],
            ...cacheOpts,
        }),
        restore: cacheRestore({
            entries: [{classifier}],
            ...cacheOpts,
        }),
        classifier,
    }
};
