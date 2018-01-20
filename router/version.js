const db = require("../common/db");
const fs = require("fs");

exports.stable = function*(req, res) {
    let body = req.body;
    let maxFile, max = 0;
    let filenames = [];
    try {
        filenames = fs.readdirSync("./public/version");
    } catch (error) {}
    for (let filename of filenames) {
        if (filename.endsWith(".wgt")) {
            var version = parseFloat(filename);
            if (version > max) {
                max = version;
                maxFile = filename;
            }
        }
    }
    return {
        version: max || body.v,
        url: maxFile ? "http://pushdog.inu1255.cn/version/" + maxFile : ""
    };
};