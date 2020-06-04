import * as winston from "winston";
import {Console, ConsoleTransportOptions} from "winston/lib/winston/transports";

export const namedLogger = (name: string, opts?: ConsoleTransportOptions) => {
    return winston.createLogger({
        transports: [
            new Console({
                // colorize: true,
                // prettyPrint: true,
                // timestamp: true,
                // label: name,
                ...opts,
            }),
        ],
    });
};
