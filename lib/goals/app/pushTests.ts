import {pushTest} from "@atomist/sdm";

export const isFlutterProject = pushTest("isFlutterProject", async (p) => {
    return p.project.fileExistsSync("pubspec.lock") && (
        p.project.fileExistsSync("pubspec.yaml") || p.project.fileExistsSync("pubspec.yml")
    );
})
