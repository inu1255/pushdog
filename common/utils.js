const fs = require("fs");
const logger = require("./log").logger;
const net = require("net");
const Duplex = require('stream').Duplex;

exports.readJson = function(filePath) {
    var s;
    try {
        s = fs.readFileSync(filePath, "utf8");
    } catch (e) {
        if (e.errno == -2) {
            logger.log(filePath, "不存在");
        } else {
            logger.log(filePath, e);
        }
        return;
    }
    return new Function("return " + s)();
};

exports.writeJson = function(filePath, data, space) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, space), "utf8");
    } catch (e) {
        logger.log(filePath, e);
    }
};

exports.readJsonAsync = function(filePath) {
    return new Promise(function(resolve, reject) {
        fs.readFile(filePath, "utf8", function(e, s) {
            if (e) {
                if (e.errno == -2) {
                    logger.log(filePath, "不存在");
                } else {
                    logger.log(filePath, e);
                }
                reject(e);
            } else resolve(new Function("return " + s)());
        });
    });
};

exports.writeJsonAsync = function(filePath, data, space) {
    return new Promise(function(resolve, reject) {
        fs.writeFile(filePath, JSON.stringify(data, null, space), "utf8", function(err, data) {
            if (err) {
                logger.log(filePath, e);
                reject(err);
            } else resolve(data);
        });
    });
};

exports.cross = function(req, res, next) {
    const origin = req.headers["origin"];
    if (origin) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader("Access-Control-Allow-Headers", "content-type");
    }
    next();
};

/**
 * 检查端口是否占用
 * @param {number} port 端口
 */
exports.probe = function(port) {
    return new Promise(function(resolve, reject) {
        var server = net.createServer().listen(port);

        var calledOnce = false;

        var timeoutRef = setTimeout(function() {
            calledOnce = true;
            resolve(true);
        }, 2000);

        server.on('listening', function() {
            clearTimeout(timeoutRef);

            if (server)
                server.close();

            if (!calledOnce) {
                calledOnce = true;
                resolve(false);
            }
        });

        server.on('error', function(err) {
            clearTimeout(timeoutRef);

            var result = false;
            if (err.code === 'EADDRINUSE')
                result = true;

            if (!calledOnce) {
                calledOnce = true;
                resolve(result);
            }
        });
    });
};

exports.streamToBuffer = function(stream) {
    return new Promise((resolve, reject) => {
        let buffers = [];
        stream.on('error', reject);
        stream.on('data', (data) => buffers.push(data));
        stream.on('end', () => resolve(Buffer.concat(buffers)));
    });
};

exports.bufferToStream = function(buffer) {
    let stream = new Duplex();
    stream.push(buffer);
    stream.push(null);
    return stream;
};