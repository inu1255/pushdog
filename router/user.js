/**
 * Created Date: 2017-09-29 15:01:20
 * Author: inu1255
 * E-Mail: 929909260@qq.com
 */
const co = require("co");
const db = require("../common/db");
const email = require("../common/email");
const config = require("../common/config");
const logger = require("../common/log").logger;

/**** 默认去掉了容易混淆的字符oOLl,9gq,Vv,Uu,I1 ****/
const CHARS = 'ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678';
const NUMBERS = '0123456789';
const USERINFO = ["id", "email", "account", "name", "money", "used_money"];

function randomString(len) {　　
    var code = '';
    for (var i = 0; i < len; i++) {　　　　
        code += CHARS.charAt(Math.floor(Math.random() * CHARS.length));　　
    }　　
    return code;
}

function randomNumber(len) {　　
    var code = '';　　
    for (var i = 0; i < len; i++) {　　　　
        code += NUMBERS.charAt(Math.floor(Math.random() * NUMBERS.length));　　
    }　　
    return code;
}

function getUserInfo(req, user) {
    return co(function*() {
        let data = {};
        if (!user) {
            user = yield db.select("user").where("id", req.session.user.id).first();
        }
        USERINFO.forEach(function(k) {
            data[k] = user[k];
        });
        req.session.user = data;
        return data;
    });
}

exports.login = function(req, res) {
    return co(function*() {
        const body = req.body;
        const user = yield db.select("user")
            .where("account", body.title)
            .orWhere("email", body.title)
            .orWhere("telphone", body.title)
            .first();
        if (!user) {
            return 404; // 用户不存在
        }
        if (user.password != body.password) {
            return 405; // 密码错误
        }
        return yield getUserInfo(req, user);
    });
};

exports.logout = function(req, res) {
    delete req.session.user;
};

function checkCode(title, code) {
    return co(function*() {
        const one = yield db.select("verify").where("title", title).first();
        // 尝试次数过多
        if (one.rest < 1) {
            return 407;
        }
        // 10分钟内有效
        if (one.update_at < new Date().getTime() - 600000) {
            return 407;
        }
        // 验证码错误
        if (one.code != code) {
            yield db.update("verify", { rest: one.rest - 1 }).where("title", title);
            return 406;
        }
    });
}

exports.register = function(req, res) {
    return co(function*() {
        const body = req.body;
        let user = yield db.select("user")
            .where("account", body.title)
            .orWhere("email", body.title)
            .orWhere("telphone", body.title)
            .first();
        if (user) {
            // 邮箱/手机被占用
            return 405;
        }
        user = yield db.select("user")
            .where("account", body.account)
            .orWhere("email", body.account)
            .orWhere("telphone", body.account)
            .first();
        if (user) {
            // 账号已经存在 408
            return 408;
        }
        const errNo = yield checkCode(body.title, body.code);
        if (errNo) {
            return errNo;
        }
        if (/^1\d{10}$/.test(body.title)) {
            // 手机注册
            body.telphone = body.title;
        } else {
            // 邮箱注册
            body.email = body.title;
        }
        let title = body.title;
        delete body.code;
        delete body.title;
        user = {};
        for (let key of USERINFO) {
            user[key] = body[key];
        }
        if (body.invite) {
            body.invite = new Buffer(body.invite, "base64").toString();
            let invitor = yield db.select("user", "money").where("id", body.invite).first();
            if (!invitor) {
                return 409;
            }
            invitor.money += 100;
            body.money = 200;
            let pack = yield db.execSQL([
                db.update("verify", { rest: -1 }).where("title", title),
                db.update("user", invitor).where("id", body.invite),
                db.insert("user", body)
            ]);
            user.id = pack.insertId;
        } else {
            body.invite = 0;
            let pack = yield db.execSQL([
                db.update("verify", { rest: -1 }).where("title", title),
                db.insert("user", body)
            ]);
            user.id = pack.insertId;
        }
        req.session.user = user;
        return user;
    });
};

exports.sendCode = function(req, res) {
    return co(function*() {
        const body = req.body;
        if (/^1\d{10}$/.test(body.title)) {
            // TODO: 发送手机验证码
            return 402;
        }
        const code = randomNumber(6);
        if (config.dev) {
            logger.info("发送邮箱验证码", code);
        } else {
            yield email.sendCode(body.title, code);
        }
        body.code = code;
        const one = yield db.select("verify").where("title", body.title).first();
        if (one) {
            yield db.update("verify", {
                code,
                rest: 10,
                update_at: new Date().getTime()
            }).where("title", body.title);
        } else {
            yield db.insert("verify", body);
        }
    });
};

exports.sendCodeCheck = function(req, res) {
    return co(function*() {
        const body = req.body;
        return yield checkCode(body.title, body.code);
    });
};

exports.whoami = function*(req, res) {
    let body = req.body;
    let user = req.session.user;
    if (user) {
        if (body.token && user.token != body.token) {
            yield db.update("user", {
                token: body.token
            }).where("id", user.id);
            user.token = body.token;
        }
        return user;
    }
    if (body.token) {
        user = yield db.select("user").where("token", body.token).first();
        if (user) {
            req.session.user = yield getUserInfo(req, user);
        }
        return user;
    }
    return 401;
};

exports.edit = function(req, res) {
    return co(function*() {
        const body = req.body;
        let user = req.session.user;
        Object.assign(user, body);
        yield db.update("user", user).where("id", user.id);
        req.session.user = user;
        return user;
    });
};