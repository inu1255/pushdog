const db = require("../common/db");
const push = require("../common/push");

exports.push = function*(req, res) {
    let body = req.body;
    let user = req.session.user;
    let service = yield db.select("service").where("id", body.sid).first();
    if (!service) {
        return 405;
    }
    if (!user && body.token != service.token) {
        return 405;
    }
    let users = yield db.execSQL("select uid,token from subscribe left join user on user.id=subscribe.uid where sid=? and token is not null", [body.sid]);
    if (users.length) {
        yield push.send(users.map(x => x.token), {
            title: service.name,
            description: body.content,
            payload: JSON.stringify(Object.assign({}, body.data, { sid: body.sid }))
        });
        let sqls = users.map(row => db.insert("notice", {
            sid: body.sid,
            uid: row.uid,
            title: service.name,
            content: body.content,
            data: JSON.stringify(body.data)
        }));
        yield db.execSQL(sqls);
    }
};

exports.read = function*(req, res) {
    let body = req.body;
    let user = req.session.user;
    return yield db.update("notice", {
        read_at: body.read ? new Date().getTime() : 0
    }).where("uid", user.id).where("id", "in", body.nids);
};

exports.list = function*(req, res) {
    let body = req.body;
    let user = req.session.user;
    let sql = db.select("notice").where("uid", user.id);
    if (body.read == 0) {
        sql.where("read_at", 0);
    } else if (body.read == 1) {
        sql.where("read_at", ">", 0);
    }
    return yield sql;
};