"use strict";
/**
 * Created Date: 2017-09-28 10:44:28
 * Author: inu1255
 * E-Mail: 929909260@qq.com
 */
const express = require("express");
const router = express.Router();
const fs = require("fs");
const co = require("co");
const path = require("path");
const utils = require("../common/utils");
const logger = require("../common/log").logger;
const config = require("../common/config");

const apiDir = config.apiDir;

function walkFiles(dir, fn) {
    const files = fs.readdirSync(dir);
    for (let filename of files) {
        filename = path.join(dir, filename);
        let stat = fs.statSync(filename);
        if (stat.isDirectory()) {
            walkFiles(filename, fn);
        } else {
            fn(filename);
        }
    }
}

function paramClean(keys) {
    const km = {};
    for (let k of keys) {
        km[k] = true;
    }
    return function(body) {
        for (let k in body) {
            if (!km[k]) {
                Reflect.deleteProperty(body, k);
            }
        }
    };
}

/**
 * 生成参数验证函数
 * @param {string} k 参数key
 * @param {string} lbl 参数名
 * @param {string} rem 参数注释
 * @param {bool} need 是否必填
 * @param {any} def 默认值
 * @param {Array} len 长度限制 [6,32] 6 [0,100]
 * @param {string} reg 正则表达式
 */
function paramCheck(k, param) {
    const rem = param.rem;
    const need = param.need;
    const def = param.def;
    const lbl = param.lbl || rem;
    const enu = param.enum;
    const typ = param.type;
    let reg = param.reg;
    let len = param.len;
    let range = param.range;
    if (need || def || len || reg || enu || typ) {
        const name = k + (lbl ? `(${lbl})` : "");
        if (len)
            len = Array.isArray(len) ? len : [len];
        if (range)
            range = Array.isArray(range) ? range : [range];
        if (reg) {
            try {
                reg = new RegExp(reg);
            } catch (error) {
                reg = null;
                logger.error(error);
            }
        }
        return function(body) {
            let value = body[k];
            if (def && value == null) {
                value = body[k] = def;
                return;
            }
            if (value == null) {
                if (need) {
                    return `${name}是必填项`;
                }
            } else {
                if (typ && value != null) {
                    switch (typ) {
                        case "int":
                            if (!/^\d/.test(value))
                                return `${name}必须是整数`;
                            value = body[k] = parseInt(value);
                            break;
                        case "number":
                            if (!/^[\d\.]/.test(value))
                                return `${name}必须是数字`;
                            value = body[k] = parseFloat(value);
                            break;
                        case "array":
                            if (typeof value !== "object") {
                                try {
                                    value = body[k] = JSON.parse(value);
                                } catch (error) {
                                    return `${name}类型必须是array`;
                                }
                            }
                            if (!(value instanceof Array))
                                return `${name}必须是数组`;
                            break;
                        case "str":
                            if (value && typeof value !== "string") {
                                value = body[k] = JSON.stringify(value);
                            }
                            break;
                        case "json":
                            if (typeof value !== "object") {
                                try {
                                    value = body[k] = JSON.parse(value);
                                } catch (error) {
                                    return `${name}类型必须是json`;
                                }
                            }
                            if (typeof value !== "object") {
                                return `${name}类型必须是json`;
                            }
                            break;
                        default:
                            if (typeof value !== typ)
                                return `${name}类型必须是${typ}`;
                    }
                }
                if (len && value != null) {
                    if (value.length < len[0]) {
                        return `${name}长度需大于${len[0]}`;
                    }
                    if (len[1] > 0 && value.length > len[1]) {
                        return `${name}长度需小于${len[1]}`;
                    }
                }
                if (range && value != null) {
                    if (value < range[0]) {
                        return `${name}需大于${range[0]}`;
                    }
                    if (typeof range[1] === "number" && value > range[1]) {
                        return `${name}需小于${range[1]}`;
                    }
                }
                if (reg && !reg.test(value)) {
                    return `${name}不满足格式${reg}`;
                }
                if (enu && enu.indexOf(value) < 0) {
                    return `${name}只能的值不在${enu}中`;
                }
            }
        };
    }
}

/**
 * 生成条件检查函数
 * @param {string} condition 条件表达式 $U: 登录用户 $S: 当前会话 $B: POST参数
 * @param {string} msg 错误信息
 */
function conditionCheck(condition, msg) {
    condition = condition.replace(/{([USB])}/g, "$$$1");
    msg = msg || "未命名错误";
    return function($B, $U, $S) {
        if (condition.indexOf("$U") >= 0 && typeof $U !== "object") {
            return 401;
        }
        if (condition.indexOf("$S") >= 0 && typeof $S !== "object") {
            return msg;
        }
        if (condition.indexOf("$B") >= 0 && typeof $B !== "object") {
            return msg;
        }
        try {
            if (!eval(`(${condition})`)) {
                return msg;
            }
        } catch (error) {
            logger.error(`(${condition})`, error);
            return msg;
        }
    };
}

function conditionChecks(check) {
    let checks = [];
    if (check instanceof Array) {
        for (let item of check) {
            if (item && typeof item.R === "string") {
                checks.push(conditionCheck(item.R, item.M));
            } else if (typeof item === "string") {
                checks.push(conditionCheck(item));
            }
        }
    } else if (check && typeof check.R === "string") {
        checks.push(conditionCheck(check.R, check.M));
    } else if (typeof check === "string") {
        checks.push(conditionCheck(check));
    } else if (typeof check === "object") {
        for (let k in check) {
            let v = check[k];
            checks.push(conditionCheck(k, v));
        }
    }
    return checks;
}

/**
 * 生成 接口失败时返回数据的函数
 * @param {object} error 接口定义中的error
 */
function makeSendErr(error) {
    error = Object.assign({}, config.error, error);
    return function(no, msg) {
        this._end = true;
        this.json({ no, msg: msg || error[no] || "未知错误" });
    };
}

/**
 * 接口成功时返回数据的函数
 * @param {object} data 
 */
function sendOk(data) {
    this._end = true;
    if (typeof data === "number")
        this.err(data);
    else if (data && data.no) {
        this.json(data);
    } else {
        this.json({ no: 200, data });
    }
}

function sendBuffer(data, headers, statusCode) {
    this._end = true;
    this.writeHead(statusCode || 200, headers);
    if (typeof data.pipe === "function") {
        data.pipe(this);
    } else {
        data.end(data, 'binary');
    }
}

function apiDefine(filename) {
    const data = utils.readJson(filename) || {};
    if (!data.name) {
        logger.warn("api定义缺少name", filename);
        return;
    }
    let method = data.method;
    if (!method) {
        logger.warn("api定义缺少method", filename);
        return;
    }
    method = method.toLowerCase();
    if (!router[method]) {
        logger.warn("api定义不支持的method", method, filename);
        return;
    }
    // 接口定义没问题

    // 构造参数检查函数
    let checks = [];
    if (data.params) {
        checks.push(paramClean(Object.keys(data.params)));
        for (let k in data.params) {
            let v = data.params[k];
            let checkFn = paramCheck(k, v);
            if (checkFn) {
                checks.push(checkFn);
            }
        }
    }
    if (data.check) {
        checks = checks.concat(conditionChecks(data.check));
    }
    let grants = [];
    if (data.grant) {
        grants = conditionChecks(data.grant);
    }
    const sendErr = makeSendErr(data.error);
    return { method, checks, grants, sendErr, ret: data.ret };
}

/**
 * 通过json接口文件生成接口并路由
 * @param {string} filename 定义api的json文件
 * @param {function|null} handler 接口实现函数
 */
function routeApi(filename, handler) {
    const data = apiDefine(filename);
    if (!data) {
        return;
    }
    // 构造接口实现函数
    let uri = filename.slice(apiDir.length, -5);
    if (!handler) {
        logger.info("define", data.method.toUpperCase(), uri, "---> Mock数据");
        handler = function(req, res) {
            console.log(data.ret);
            res.json(data.ret);
        };
    } else {
        logger.info("define", data.method.toUpperCase(), uri);
    }
    // 开始路由
    router[data.method](uri, function(req, res) {
        res.err = data.sendErr;
        res.ok = sendOk;
        res.buffer = sendBuffer;
        req.body = Object.assign({}, req.query, req.body);
        req.session = req.session || {};
        // 参数检查
        for (let fn of data.checks) {
            let msg = fn(req.body, req.session.user, req.session);
            if (msg) {
                res.err(400, msg);
                return;
            }
        }
        // 权限检查
        for (let fn of data.grants) {
            let msg = fn(req.body, req.session.user, req.session);
            if (msg) {
                if (msg == 401)
                    res.err(401);
                else
                    res.err(403, msg);
                return;
            }
        }
        let ret;
        if (handler.constructor.name === "GeneratorFunction") {
            ret = co(handler(req, res));
        } else {
            ret = handler(req, res);
        }
        if (!res.finished && !res._end) {
            // 返回 promise 则 then
            if (ret && typeof ret.then === "function") {
                ret.then(function(data) {
                    res.ok(data);
                }, function(err) {
                    logger.error(err);
                    if (err.code == "ER_DUP_ENTRY") {
                        res.err(402);
                    } else {
                        res.err(500, err);
                    }
                });
            } else {
                try {
                    res.ok(ret);
                } catch (error) {
                    if (error != "Error: Can't set headers after they are sent.") {
                        console.log(error);
                    }
                }
            }
        }
    });
}

/**
 * 通过api.json文件获取对应的 接口实现函数
 * @param {string} filename 文件名
 */
function getHander(filename) {
    // ./person/login
    let modulePath = "." + filename.slice(apiDir.length, -5);
    // [".","person","login"]
    let ss = modulePath.split(path.sep);
    // login
    let key = ss[ss.length - 1].replace(/-\w/g, a => a[1].toUpperCase());
    // ./person
    modulePath = ss.slice(0, ss.length - 1).join("/");
    if (ss.length == 2) {
        modulePath += "/main";
    }
    var handler;
    try {
        let mod = require(modulePath);
        // console.log(Object.keys(mod), key);
        if (mod && typeof mod[key] === "function")
            handler = mod[key];
    } catch (error) {
        logger.error(error);
    }
    return handler;
}

walkFiles(apiDir, function(filename) {
    if (filename.endsWith(".json")) {
        routeApi(filename, getHander(filename));
    }
});

module.exports = router;