import * as puppeteer from "puppeteer";
import {goal} from "@atomist/sdm";

export const getScreenshotFromHtmlOnDisk = async (rootDir: string, filePath: string) => {
    // don't include the no-sandbox stuff yet, check performance
    const browser = await puppeteer.launch({args: []}); // ["--no-sandbox", "--disable-setuid-sandbox"]});
    const page = await browser.newPage();
    await page.goto(``);
    await page.screenshot({path: "buddy-screenshot.png"});
    await browser.close();
};

export const siteGenPreviewPng = goal({displayName: ""})
