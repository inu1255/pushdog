const db = require("../common/db");
const fs = require("fs");

exports.stable = function*(req, res) {
    let body = req.body;
    let filenames = fs.readdirSync("./public/version");
    let maxFile, max = 0;
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