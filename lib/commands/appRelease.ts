import {CommandHandlerRegistration, SoftwareDeliveryMachine} from "@atomist/sdm";
// import {Parameters, Secret, Secrets} from "@atomist/automation-client/lib/decorators";
import {NoParameters} from "@atomist/automation-client";

//
// @Parameters()
// export class ReleaseParams {
//     @Secret(Secrets.OrgToken)
//     public readonly orgToken: string;
// }

const releaseTypes = ["version", "major", "minor", "buildn"] as const;
type ReleaseTypes = typeof releaseTypes[number];

const releaseDesc: {[k in ReleaseTypes]: string} = {
    "version": "bumps version on **X**.y.z+n -- used for INSANE releases (disabled)",
    major:     "bumps version on x.**Y**.z+n -- used for MAJOR releases (big new features, like upgrading the blockchain layer)",
    minor:     "bumps version on x.y.**Z**+n -- used for MINOR releases (smaller features, large bugfixes)",
    buildn:    "bumps version on x.y.z+**N** -- used for BUGFIX releases (super minor changes)",

}

export function doAppRelease(sdm: SoftwareDeliveryMachine): CommandHandlerRegistration<NoParameters> {
    return {
        name: "AppRelease",
        description: "Do a new release of the app -- generate signed app packages.",
        intent: "app release prod",
        paramsMaker: NoParameters,
        listener: async (cli) => {
            interface Params {
                releaseType: typeof releaseTypes[number],
            }

            const params = await cli.promptFor<Params>({
                releaseType: {
                    displayName: "Type of release",
                    description: "Select the type of release to do",
                    type: {
                        kind: "single",
                        options: releaseTypes.map(r => ({
                            value: r,
                            description: releaseDesc[r],
                        }))
                    }
                }
            })

            await cli.addressChannels(`Normally I would do a ${params.releaseType} here.`);
        }
    }
}
