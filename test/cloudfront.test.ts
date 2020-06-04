// import AWS = require("aws-sdk");
import * as assert from "power-assert";
import {cfCreateDistribution, cfDeleteDistribution} from "../lib/aws/cloudfront";

describe("cloudfront core", () => {
    it("create CF distribs", async () => {
        // const cf = new AWS.CloudFront();
        const shaFrag = `test-${Date.now().toString().slice(-5)}`;
        const distrib = await cfCreateDistribution(shaFrag, {Enabled: false});
        assert(!!distrib.Distribution?.Id, "we get an ID back from createDistrib call");

        const delRes = await cfDeleteDistribution(distrib.Distribution?.Id || "", distrib.ETag || "");
        assert(!delRes.$response.error, "no error when deleting cf distrib");
    }).timeout(300000);
    // how long does cloudfront take?
});
