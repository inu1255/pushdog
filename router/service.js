const db = require("../common/db");
const md5 = require("md5");
var qr = require('qr-image');

exports.create = function*(req, res) {
    let body = req.body;
    let user = req.session.user;
    let service = {
        uid: user.id,
        code: body.code,
        name: body.name,
        logo: body.logo,
        brief: body.brief,
        token: body.token,
    };
    yield db.insert("service", service);
};

exports.update = function*(req, res) {
    let body = req.body;
    let user = req.session.user;
    let service = {
        name: body.name,
        logo: body.logo,
        brief: body.brief,
        token: body.token,
    };
    yield db.update("service", service).where({
        uid: user.id,
        code: body.code,
    });
};

exports.list = function*(req, res) {
    let body = req.body;
    let sql = db.select("service", ["code", "name", "logo", "brief", ]);
    if (body.uid) {
        sql.where("uid", body.uid);
    }
    if (body.s) {
        sql.orWhere(db.where("name", "like", body.s).or("brief", "like", body.s));
    }
    sql.orderBy("update_at desc").limit(body.offset, 10);
    return yield sql;
};

exports.qrcode = function*(req, res) {
    let body = req.body;
    let user = req.session.user;
    let service = yield db.select("service").where({ id: body.sid, uid: user.id }).first();
    if (!service) {
        return 404;
    }
    var expired_at = new Date().getTime() + body.minute * 60e3;
    let sign = md5([body.sid, body.uid, expired_at, service.token].join("&"));
    let key = JSON.stringify({
        sid: body.sid,
        uid: body.uid,
        expired_at,
        sign,
    });
    key = new Buffer(key).toString("base64");
    if (body.pic) {
        var qr_svg = qr.image(key, { type: 'png' });
        res.buffer(qr_svg, { 'Content-Type': 'image/png' });
        return qr_svg;
    }
    return key;
};

exports.subscribe = function*(req, res) {
    let body = req.body;
    let user = req.session.user;
    let data = JSON.parse(new Buffer(body.key, "base64").toString());
    if (data.expired_at < new Date().getTime()) {
        return 406;
    }
    if (data.uid && data.uid != user.id) {
        return 407;
    }
    if (!data.sid) {
        return 408;
    }
    let service = yield db.select("service").where("id", data.sid).first();
    let sign = md5([data.sid, data.uid, data.expired_at, service.token].join("&"));
    if (sign != data.sign) {
        return 405;
    }
    db.insert("subscribe", {
        sid: data.sid,
        uid: user.id
    }).then();
    return data;
};

exports.unsubscribe = function*(req, res) {
    let body = req.body;
    let user = req.session.user;
    yield db.delete("subscribe").where({
        uid: user.id,
        sid: body.sid
    });
};

exports.mysub = function*(req, res) {
    let user = req.session.user;
    let rows = yield db.execSQL("select id,code,name,logo,brief from service where id in (select sid from subscribe where uid=?)", [user.id]);
    for (let row of rows) {
        row.unread = yield db.execSQL("select count(id) as count from notice where read_at=0 and sid=? and uid=?", [row.id, user.id]).first();
        row.unread = row.unread.count;
    }
    return rows;
};