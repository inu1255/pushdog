/**
 * Created Date: 2017-09-25 17:30:38
 * Author: inu1255
 * E-Mail: 929909260@qq.com
 */
const express = require("express");
const bodyParser = require('body-parser');
const hot = require("node-hot-require");
hot.filter = function(filename) {
    if (filename.endsWith("common/storage.js")) {
        return false;
    }
    return true;
};
const router = hot.require("./router/index.js");
const session = require("./common/session");
const connectLogger = require("./common/log").connectLogger;
const dev = require("./common/log").getLogger("dev");
const app = express();
const config = require("./common/config");
const chokidar = require("chokidar");
const utils = require("./common/utils");

if (config.dev) {
    hot.watchAll();
    chokidar.watch("./api").on("change", function() {
        hot.reloadAll();
    });
}

hot.on("reload", function(err) {
    if (err) {
        dev.warn("重新加载模块失败", err);
    }
});

app.use(express.static('public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use(connectLogger);
app.use("/api", session);
app.use("/api", utils.cross);
app.use("/api", router);

app.get("/upgrade", function(req, res) {
    hot.reloadAll();
    res.send(router.version());
});

app.get('*', function(req, res) {
    res.sendFile("./public/index.html");
});

app.listen(config.port, function() {
    console.log('Listening on http://localhost:' + config.port);
});